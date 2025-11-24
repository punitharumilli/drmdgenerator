
import { GoogleGenAI, Type } from "@google/genai";
import { DRMD } from "../types";
import { convertToDSI } from "../utils/unitConverter";

const SYSTEM_INSTRUCTION = `
You are an expert in Reference Material Certificates and XML schema extraction. 
Your goal is to extract structured data from the provided content of a certificate into a JSON format that strictly adheres to the Digital Reference Material Document (DRMD) structure.

The input is a PDF IMAGE (for vision processing). You must intelligently reconstruct the logical structure.

**CRITICAL: COORDINATE EXTRACTION**
For key fields, you MUST extract the bounding box coordinates of the text in the PDF.
The format for coordinates is an integer array: [pageIndex, ymin, xmin, ymax, xmax].
- **pageIndex**: 1-based index of the page where the text is found.
- **ymin, xmin, ymax, xmax**: Coordinates normalized to a 0-1000 scale.

**SECTION COORDINATES (IMPORTANT)**
You MUST extract the bounding box of the **ENTIRE SECTION** for the following entities. 
The section box should encompass all fields, labels, and content belonging to that entity.
Populate the 'sectionCoordinates' field for:
- Each **Producer** (name, address, contacts).
- Each **Responsible Person** block (name, role, signature area).
- Each **Material** description block.
- Each **MeasurementResult** (Table) - encompassing the table title, headers, and all data rows.

Key Extraction Rules:
1. **Administrative Data**: 
   - Extract producer details, responsible persons (names/roles/signatures).
   - **Validity**:
     - "valid for X months" -> 'Time After Dispatch' (durationM).
     - "valid until [Date]" -> 'Specific Time' (specificTime).
     - "valid until revoked" -> 'Until Revoked'.

2. **Materials**: Extract name, description, and minimum sample size.
   - **IMPORTANT**: The "Material Name" is often the prominent title of the document (e.g., "Li-NMC 111..."). Ensure you extract specific **fieldCoordinates** for the 'name' field, distinct from the generic section block.

3. **Properties (CRITICAL - TABLE STRUCTURE)**: 
   - **Property vs. Result**: A "Property" is a high-level section (e.g., "Certified Values", "Informative Values"). A "MeasurementResult" is a specific table within that section.
   - **EXCLUSION RULES (STRICT)**: 
     - **DO NOT EXTRACT** tables containing "Means of Accepted Data Sets", "Laboratory Means", "Participant Results", "Statistical Data", "Homogeneity", or raw data.
     - **ONLY EXTRACT** tables explicitly related to "Certified Values" (or "Certified Property Values") and "Informative Values" (or "Indicative Values", "Additional Material Information").
   - **MULTIPLE TABLES**: If a section contains VISUALLY DISTINCT tables with different column structures (e.g., one table for "Chemical Composition" and another for "Physical Properties"), create SEPARATE 'MeasurementResult' objects for each.
   - **MERGING RULES**: If a single table is split only by unit headers (e.g., "in %" followed by rows, then "in mg/kg" followed by rows), MERGE them into ONE 'MeasurementResult'.
   - **NAMING**: 
     - Give specific names to tables if possible (e.g., "Mass Fraction", "Physical Properties").
     - FORBIDDEN NAMES: Do NOT use "Table 1", "Raw Data", "in mg/kg", "in %" as the *main* table name.
   - **FOOTNOTES & DESCRIPTIONS**: 
     - Capture numbered footnotes (1), 2)) or '*' descriptions found immediately below a table strictly into the 'description' field of that SPECIFIC 'MeasurementResult'. 
     - **DO NOT** put table-specific footnotes in the 'MaterialProperty' description field. Keep the property description for general text.
   - **COLUMN MAPPING**:
     - Values like "< 2" or "> 100" are VALUES. Put them in 'value'. Leave 'uncertainty' empty.

4. **Statements**: Extract full text and BOUNDING BOX COORDINATES (into fieldCoordinates) for Intended Use, Storage, Handling, etc.

Return ONLY the JSON object.
`;

// Helper for Coordinate Box [page, ymin, xmin, ymax, xmax]
const BoxSchema = {
    type: Type.ARRAY,
    items: { type: Type.INTEGER }
};

// Context-Specific Coordinate Schemas to reduce constraint complexity
const AdminCoordSchema = {
    type: Type.OBJECT,
    properties: {
        title: BoxSchema,
        uniqueIdentifier: BoxSchema,
        dateOfIssue: BoxSchema
    },
    nullable: true
};

const ProducerCoordSchema = {
    type: Type.OBJECT,
    properties: {
        name: BoxSchema,
        email: BoxSchema,
        phone: BoxSchema,
        fax: BoxSchema,
        street: BoxSchema,
        streetNo: BoxSchema,
        postCode: BoxSchema,
        city: BoxSchema,
        countryCode: BoxSchema
    },
    nullable: true
};

const PersonCoordSchema = {
    type: Type.OBJECT,
    properties: {
        name: BoxSchema,
        role: BoxSchema,
        description: BoxSchema
    },
    nullable: true
};

const MaterialCoordSchema = {
    type: Type.OBJECT,
    properties: {
        name: BoxSchema,
        description: BoxSchema,
        materialClass: BoxSchema,
        itemQuantities: BoxSchema,
        minimumSampleSize: BoxSchema
    },
    nullable: true
};

const QuantityCoordSchema = {
    type: Type.OBJECT,
    properties: {
        name: BoxSchema,
        value: BoxSchema,
        unit: BoxSchema,
        uncertainty: BoxSchema,
        coverageFactor: BoxSchema
    },
    nullable: true
};

const StatementCoordSchema = {
    type: Type.OBJECT,
    properties: {
        intendedUse: BoxSchema,
        commutability: BoxSchema,
        storageInformation: BoxSchema,
        handlingInstructions: BoxSchema,
        metrologicalTraceability: BoxSchema,
        healthAndSafety: BoxSchema,
        subcontractors: BoxSchema,
        legalNotice: BoxSchema,
        referenceToCertificationReport: BoxSchema
    },
    nullable: true
};

// Response Schema Definition
const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        administrativeData: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                validityType: { type: Type.STRING, enum: ["Until Revoked", "Time After Dispatch", "Specific Time"] },
                durationY: { type: Type.INTEGER },
                durationM: { type: Type.INTEGER },
                dateOfIssue: { type: Type.STRING },
                specificTime: { type: Type.STRING },
                fieldCoordinates: AdminCoordSchema,
                producers: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            email: { type: Type.STRING },
                            phone: { type: Type.STRING },
                            fax: { type: Type.STRING },
                            fieldCoordinates: ProducerCoordSchema,
                            sectionCoordinates: BoxSchema,
                            address: {
                                type: Type.OBJECT,
                                properties: {
                                    street: { type: Type.STRING },
                                    streetNo: { type: Type.STRING },
                                    postCode: { type: Type.STRING },
                                    city: { type: Type.STRING },
                                    countryCode: { type: Type.STRING }
                                }
                            },
                            organizationIdentifiers: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        scheme: { type: Type.STRING },
                                        value: { type: Type.STRING },
                                        link: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    }
                },
                responsiblePersons: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            role: { type: Type.STRING },
                            description: { type: Type.STRING },
                            fieldCoordinates: PersonCoordSchema,
                            sectionCoordinates: BoxSchema
                        }
                    }
                }
            }
        },
        materials: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    minimumSampleSize: { type: Type.STRING },
                    materialClass: { type: Type.STRING },
                    itemQuantities: { type: Type.STRING },
                    isCertified: { type: Type.BOOLEAN },
                    fieldCoordinates: MaterialCoordSchema,
                    sectionCoordinates: BoxSchema
                }
            }
        },
        properties: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    isCertified: { type: Type.BOOLEAN },
                    description: { type: Type.STRING },
                    procedures: { type: Type.STRING },
                    results: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                name: { type: Type.STRING },
                                description: { type: Type.STRING },
                                sectionCoordinates: BoxSchema,
                                quantities: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            name: { type: Type.STRING },
                                            value: { type: Type.STRING },
                                            unit: { type: Type.STRING },
                                            dsiValue: { type: Type.STRING },
                                            dsiUnit: { type: Type.STRING },
                                            uncertainty: { type: Type.STRING },
                                            coverageFactor: { type: Type.STRING },
                                            coverageProbability: { type: Type.STRING },
                                            distribution: { type: Type.STRING },
                                            fieldCoordinates: QuantityCoordSchema
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        statements: {
            type: Type.OBJECT,
            properties: {
                official: {
                    type: Type.OBJECT,
                    properties: {
                        intendedUse: { type: Type.STRING },
                        storageInformation: { type: Type.STRING },
                        handlingInstructions: { type: Type.STRING },
                        metrologicalTraceability: { type: Type.STRING },
                        healthAndSafety: { type: Type.STRING },
                        subcontractors: { type: Type.STRING },
                        legalNotice: { type: Type.STRING },
                        referenceToCertificationReport: { type: Type.STRING },
                        fieldCoordinates: StatementCoordSchema
                    }
                }
            }
        }
    }
} as const;

export const extractStructuredDataFromPdf = async (base64Pdf: string, apiKey: string): Promise<Partial<DRMD>> => {
    const ai = new GoogleGenAI({ apiKey: apiKey });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: base64Pdf
                        }
                    },
                    { text: "Extract the structured data from this Reference Material Certificate PDF." }
                ]
            },
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0
            }
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("No data returned from Gemini Vision");
        
        const parsedData = JSON.parse(jsonText) as Partial<DRMD>;

        // Post-processing: Calculate D-SI values
        if (parsedData.properties) {
             parsedData.properties.forEach(prop => {
                 if (prop.results) {
                     prop.results.forEach(res => {
                         if (res.quantities) {
                             res.quantities.forEach(q => {
                                 const dsi = convertToDSI(q.value, q.unit);
                                 (q as any).dsiValue = dsi.dsiValue;
                                 (q as any).dsiUnit = dsi.dsiUnit;
                             });
                         }
                     });
                 }
             });
        }

        return parsedData;

    } catch (error) {
        console.error("Gemini Vision Extraction Error:", error);
        throw error;
    }
};
