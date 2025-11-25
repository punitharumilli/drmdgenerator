

import { DRMD } from "../types";

const escapeXml = (unsafe: string | undefined | number | boolean) => {
    if (unsafe === undefined || unsafe === null) return '';
    return String(unsafe).replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

const renderValidity = (data: DRMD["administrativeData"]) => {
    if (data.validityType === "Until Revoked") {
        return "        <drmd:untilRevoked>true</drmd:untilRevoked>";
    } else if (data.validityType === "Specific Time") {
        return `        <drmd:specificTime>${escapeXml(data.specificTime)}</drmd:specificTime>`;
    } else if (data.validityType === "Time After Dispatch") {
        let iso = "P";
        if (data.durationY) iso += `${data.durationY}Y`;
        if (data.durationM) iso += `${data.durationM}M`;
        if (iso === "P") iso = "P0Y"; 
        return `        <drmd:timeAfterDispatch>
          <drmd:dispatchDate>${escapeXml(data.dateOfIssue)}</drmd:dispatchDate>
          <drmd:period>${iso}</drmd:period>
        </drmd:timeAfterDispatch>`;
    }
    return "";
};

export const generateDrmdXml = (data: DRMD): string => {
    const header = `<?xml version='1.0' encoding='utf-8'?>
<drmd:digitalReferenceMaterialDocument xmlns:dcc="https://ptb.de/dcc" xmlns:drmd="https://example.org/drmd" xmlns:si="https://ptb.de/si" schemaVersion="0.3.0">`;

    // --- Administrative Data ---
    let adminXml = `
  <drmd:administrativeData>
    <drmd:coreData>
      <drmd:titleOfTheDocument>${escapeXml(data.administrativeData.title)}</drmd:titleOfTheDocument>
      <drmd:uniqueIdentifier>${escapeXml(data.administrativeData.uniqueIdentifier)}</drmd:uniqueIdentifier>
      <drmd:validity>
${renderValidity(data.administrativeData)}
      </drmd:validity>
    </drmd:coreData>`;

    // Producers
    data.administrativeData.producers.forEach(prod => {
        adminXml += `
    <drmd:referenceMaterialProducer>
      <drmd:name>
        <dcc:content lang="en">${escapeXml(prod.name)}</dcc:content>
      </drmd:name>
      <drmd:contact>
        <dcc:name>
          <dcc:content lang="en">${escapeXml(prod.name)}</dcc:content>
        </dcc:name>
        <dcc:eMail>${escapeXml(prod.email)}</dcc:eMail>
        <dcc:phone>${escapeXml(prod.phone)}</dcc:phone>
        ${prod.fax ? `<dcc:fax>${escapeXml(prod.fax)}</dcc:fax>` : ''}
        <dcc:location>
          <dcc:street>${escapeXml(prod.address.street)}</dcc:street>
          <dcc:streetNo>${escapeXml(prod.address.streetNo)}</dcc:streetNo>
          <dcc:postCode>${escapeXml(prod.address.postCode)}</dcc:postCode>
          <dcc:city>${escapeXml(prod.address.city)}</dcc:city>
          <dcc:countryCode>${escapeXml(prod.address.countryCode)}</dcc:countryCode>
        </dcc:location>
      </drmd:contact>
    </drmd:referenceMaterialProducer>`;
    });

    // Responsible Persons
    if (data.administrativeData.responsiblePersons.length > 0) {
        adminXml += `
    <drmd:respPersons>`;
        data.administrativeData.responsiblePersons.forEach(p => {
            adminXml += `
      <dcc:respPerson>
        <dcc:person>
          <dcc:name>
            <dcc:content lang="en">${escapeXml(p.name)}</dcc:content>
          </dcc:name>
        </dcc:person>`;
            if (p.description) {
                adminXml += `
        <dcc:description>
          <dcc:content lang="en">${escapeXml(p.description)}</dcc:content>
        </dcc:description>`;
            }
            adminXml += `
        <dcc:role>${escapeXml(p.role)}</dcc:role>
        <dcc:mainSigner>${p.mainSigner}</dcc:mainSigner>
      </dcc:respPerson>`;
        });
        adminXml += `
    </drmd:respPersons>`;
    }
    adminXml += `
  </drmd:administrativeData>`;

    // --- Materials ---
    let materialsXml = `
  <drmd:materials>`;
    data.materials.forEach(mat => {
        const safeMinSize = mat.minimumSampleSize || '';
        
        materialsXml += `
    <drmd:material>
      <drmd:name>
        <dcc:content lang="en">${escapeXml(mat.name)}</dcc:content>
      </drmd:name>
      <drmd:description>
        <dcc:content lang="en">${escapeXml(mat.description)}</dcc:content>
      </drmd:description>
      <drmd:minimumSampleSize>
        <dcc:itemQuantity>
          <si:realListXMLList>
            <si:valueXMLList>${escapeXml(safeMinSize.replace(/[a-zA-Z\s]/g, ''))}</si:valueXMLList>
            <si:unitXMLList>${escapeXml(safeMinSize.replace(/[\d\.\s]/g, ''))}</si:unitXMLList>
          </si:realListXMLList>
        </dcc:itemQuantity>
      </drmd:minimumSampleSize>`;
        if (mat.itemQuantities) {
            materialsXml += `
      <drmd:itemQuantities>
        <dcc:itemQuantity>
          <si:realListXMLList>
            <si:valueXMLList>${escapeXml(mat.itemQuantities)}</si:valueXMLList>
            <si:unitXMLList/>
          </si:realListXMLList>
        </dcc:itemQuantity>
      </drmd:itemQuantities>`;
        }
        materialsXml += `
    </drmd:material>`;
    });
    materialsXml += `
  </drmd:materials>`;

    // --- Properties ---
    let propertiesXml = `
  <drmd:materialPropertiesList>`;
    data.properties.forEach(prop => {
        propertiesXml += `
    <drmd:materialProperties isCertified="${prop.isCertified}">
      <drmd:name>
        <dcc:content lang="en">${escapeXml(prop.name)}</dcc:content>
      </drmd:name>`;
        if (prop.description) {
            propertiesXml += `
      <drmd:description>
        <dcc:content lang="en">${escapeXml(prop.description)}</dcc:content>
      </drmd:description>`;
        }
        if (prop.procedures) {
            propertiesXml += `
      <drmd:procedures>
        <dcc:usedMethod>
          <dcc:name>
            <dcc:content lang="en">Procedure</dcc:content>
          </dcc:name>
          <dcc:description>
            <dcc:content lang="en">${escapeXml(prop.procedures)}</dcc:content>
          </dcc:description>
        </dcc:usedMethod>
      </drmd:procedures>`;
        }
        propertiesXml += `
      <drmd:results>`;
        
        prop.results.forEach(res => {
            propertiesXml += `
        <drmd:result>
          <drmd:name>
            <dcc:content lang="en">${escapeXml(res.name || "Values")}</dcc:content>
          </drmd:name>`;
            if (res.description) {
                propertiesXml += `
          <drmd:description>
            <dcc:content lang="en">${escapeXml(res.description)}</dcc:content>
          </drmd:description>`;
            }
            propertiesXml += `
          <drmd:data>
            <drmd:list>`;
            res.quantities.forEach(q => {
                const val = q.dsiValue || q.value;
                const unit = q.dsiUnit || q.unit;
                
                propertiesXml += `
              <drmd:quantity>
                <dcc:name>
                  <dcc:content lang="en">${escapeXml(q.name)}</dcc:content>
                </dcc:name>
                <si:real>
                  <si:value>${escapeXml(val)}</si:value>
                  <si:unit>${escapeXml(unit)}</si:unit>
                  <si:measurementUncertaintyUnivariate>
                    <si:expandedMU>
                      <si:valueExpandedMU>${escapeXml(q.uncertainty)}</si:valueExpandedMU>
                    </si:expandedMU>
                  </si:measurementUncertaintyUnivariate>
                </si:real>
              </drmd:quantity>`;
            });
            propertiesXml += `
            </drmd:list>
          </drmd:data>
        </drmd:result>`;
        });
        propertiesXml += `
      </drmd:results>
    </drmd:materialProperties>`;
    });
    propertiesXml += `
  </drmd:materialPropertiesList>`;

    // --- Statements ---
    const st = data.statements.official;
    let statementsXml = `
  <drmd:statements>`;
    
    const addStatement = (tag: string, name: string, content: string) => {
        if (!content) return '';
        return `
    <drmd:${tag}>
      <dcc:name>
        <dcc:content lang="en">${escapeXml(name)}</dcc:content>
      </dcc:name>
      <dcc:content lang="en">${escapeXml(content)}</dcc:content>
    </drmd:${tag}>`;
    };

    statementsXml += addStatement("intendedUse", "Intended Use", st.intendedUse);
    statementsXml += addStatement("storageInformation", "Storage Information", st.storageInformation);
    statementsXml += addStatement("instructionsForHandlingAndUse", "Handling Instructions", st.handlingInstructions);
    statementsXml += addStatement("metrologicalTraceability", "Metrological Traceability", st.metrologicalTraceability);
    statementsXml += addStatement("subcontractors", "Subcontractors", st.subcontractors);
    statementsXml += addStatement("referenceToCertificationReport", "Reference to Certification Report", st.referenceToCertificationReport);
    statementsXml += addStatement("healthAndSafetyInformation", "Health And Safety Information", st.healthAndSafety);
    statementsXml += addStatement("legalNotice", "Legal Notice", st.legalNotice);
    
    statementsXml += `
  </drmd:statements>`;

    const footer = `
</drmd:digitalReferenceMaterialDocument>`;

    return header + adminXml + materialsXml + propertiesXml + statementsXml + footer;
};
