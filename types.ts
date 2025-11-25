
export interface Identifier {
    scheme: string;
    value: string;
    link?: string;
}

export interface Address {
    street: string;
    streetNo: string;
    postCode: string;
    city: string;
    countryCode: string;
}

export interface HasCoordinates {
    fieldCoordinates?: Record<string, number[]>; // [pageIndex, ymin, xmin, ymax, xmax] (0-1000 scale)
    sectionCoordinates?: number[]; // [pageIndex, ymin, xmin, ymax, xmax] (0-1000 scale)
}

export interface Producer extends HasCoordinates {
    uuid: string;
    name: string;
    email: string;
    phone: string;
    fax?: string;
    address: Address;
    organizationIdentifiers: Identifier[];
}

export interface ResponsiblePerson extends HasCoordinates {
    uuid: string;
    name: string;
    role: string;
    description: string;
    mainSigner: boolean;
    cryptElectronicSeal: boolean;
    cryptElectronicSignature: boolean;
    cryptElectronicTimeStamp: boolean;
}

export interface AdministrativeData extends HasCoordinates {
    title: string;
    uniqueIdentifier: string;
    dataVersion: number;
    documentIdentifiers: Identifier[];
    validityType: "Until Revoked" | "Time After Dispatch" | "Specific Time";
    durationY: number;
    durationM: number;
    dateOfIssue: string; // YYYY-MM-DD
    specificTime: string; // YYYY-MM-DD
    producers: Producer[];
    responsiblePersons: ResponsiblePerson[];
}

export interface Material extends HasCoordinates {
    uuid: string;
    name: string;
    materialClass: string;
    description: string;
    itemQuantities: string;
    minimumSampleSize: string;
    isCertified: boolean;
    materialIdentifiers: Identifier[];
}

export interface Quantity extends HasCoordinates {
    uuid: string;
    name: string; // Element/Name
    label?: string;
    value: string;
    dsiValue: string; // Changed from siValue
    dsiUnit: string;  // Changed from siUnit
    quantityKind?: string;
    unit: string;
    uncertainty: string;
    coverageFactor: string;
    coverageProbability: string;
    distribution: string;
    identifiers: Identifier[];
}

export interface MeasurementResult extends HasCoordinates {
    uuid: string;
    name: string; // Table Name
    description: string;
    quantities: Quantity[];
}

export interface MaterialProperty {
    uuid: string;
    id: string;
    name: string; // e.g., "Certified Values"
    isCertified: boolean;
    description: string;
    procedures: string;
    results: MeasurementResult[];
}

export interface OfficialStatements extends HasCoordinates {
    intendedUse: string;
    commutability: string;
    storageInformation: string;
    handlingInstructions: string;
    metrologicalTraceability: string;
    healthAndSafety: string;
    subcontractors: string;
    legalNotice: string;
    referenceToCertificationReport: string;
}

export interface CustomStatement {
    uuid: string;
    name: string;
    content: string;
}

export interface Statements {
    official: OfficialStatements;
    custom: CustomStatement[];
}

export interface Comment {
    uuid: string;
    author: string;
    date: string;
    content: string;
}

export interface AdditionalDocument {
    uuid: string;
    title: string;
    type: string;
    content: string;
}

export interface DRMD {
    administrativeData: AdministrativeData;
    materials: Material[];
    properties: MaterialProperty[];
    statements: Statements;
    comments: Comment[];
    documents: AdditionalDocument[];
}

// Constants for Initial States
export const ALLOWED_TITLES = [
    "referenceMaterialCertificate",
    "calibrationCertificate",
    "measurementCertificate"
];

export const INITIAL_ID: Identifier = { scheme: "", value: "", link: "" };

export const INITIAL_PRODUCER: Producer = {
    uuid: "",
    name: "",
    email: "",
    phone: "",
    fax: "",
    address: { street: "", streetNo: "", postCode: "", city: "", countryCode: "" },
    organizationIdentifiers: [{ ...INITIAL_ID }]
};

export const INITIAL_PERSON: ResponsiblePerson = {
    uuid: "",
    name: "",
    role: "",
    description: "",
    mainSigner: true, // Defaulting to true as requested
    cryptElectronicSeal: false,
    cryptElectronicSignature: false,
    cryptElectronicTimeStamp: false
};

export const INITIAL_QUANTITY: Quantity = {
    uuid: "",
    name: "",
    label: "",
    value: "",
    dsiValue: "",
    dsiUnit: "",
    quantityKind: "",
    unit: "",
    uncertainty: "",
    coverageFactor: "2.0",
    coverageProbability: "0.95",
    distribution: "normal",
    identifiers: []
};

export const INITIAL_DRMD: DRMD = {
    administrativeData: {
        title: "referenceMaterialCertificate",
        uniqueIdentifier: "",
        dataVersion: 0,
        documentIdentifiers: [{ ...INITIAL_ID }],
        validityType: "Until Revoked",
        durationY: 0,
        durationM: 0,
        dateOfIssue: new Date().toISOString().split('T')[0],
        specificTime: new Date().toISOString().split('T')[0],
        producers: [{ ...INITIAL_PRODUCER }],
        responsiblePersons: [{ ...INITIAL_PERSON }]
    },
    materials: [],
    properties: [],
    statements: {
        official: {
            intendedUse: "",
            commutability: "",
            storageInformation: "",
            handlingInstructions: "",
            metrologicalTraceability: "",
            healthAndSafety: "",
            subcontractors: "",
            legalNotice: "",
            referenceToCertificationReport: ""
        },
        custom: []
    },
    comments: [],
    documents: []
};
