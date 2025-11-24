
/**
 * Utility to convert human-readable units to machine-readable D-SI format.
 * Follows guidelines from the D-SI specifications (Platinum/Gold class).
 */

export interface DsiConversion {
    dsiUnit: string;
    factor: number;
    offset?: number;
}

// STRICT D-SI MAPPING according to SmartCom D-SI Guide (Platinum/Gold)
const UNIT_MAP: Record<string, DsiConversion> = {
    // --- Dimensionless / Ratios ---
    '%': { dsiUnit: '\\one', factor: 0.01 },
    'percent': { dsiUnit: '\\one', factor: 0.01 },
    'ppm': { dsiUnit: '\\one', factor: 1e-6 },
    'ppb': { dsiUnit: '\\one', factor: 1e-9 },

    // --- Mass Fractions ---
    'mg/kg': { dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}', factor: 1 }, 
    'mgkg-1': { dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'mgkg⁻¹': { dsiUnit: '\\milli\\gram\\kilogram\\tothe{-1}', factor: 1 },
    
    'µg/kg': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'ug/kg': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'μg/kg': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 }, // Greek mu
    'µgkg-1': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'ugkg-1': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'µgkg⁻¹': { dsiUnit: '\\micro\\gram\\kilogram\\tothe{-1}', factor: 1 },

    'g/kg': { dsiUnit: '\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'gkg-1': { dsiUnit: '\\gram\\kilogram\\tothe{-1}', factor: 1 },
    'gkg⁻¹': { dsiUnit: '\\gram\\kilogram\\tothe{-1}', factor: 1 },

    'mg/g': { dsiUnit: '\\milli\\gram\\gram\\tothe{-1}', factor: 1 },
    'mgg-1': { dsiUnit: '\\milli\\gram\\gram\\tothe{-1}', factor: 1 },

    'ug/g': { dsiUnit: '\\micro\\gram\\gram\\tothe{-1}', factor: 1 },
    'µg/g': { dsiUnit: '\\micro\\gram\\gram\\tothe{-1}', factor: 1 },
    'μg/g': { dsiUnit: '\\micro\\gram\\gram\\tothe{-1}', factor: 1 },
    
    'g/100g': { dsiUnit: '\\gram\\hecto\\gram\\tothe{-1}', factor: 1 }, 

    // --- Specific Surface Area ---
    'm2/g': { dsiUnit: '\\metre\\tothe{2}\\gram\\tothe{-1}', factor: 1 },
    'm²/g': { dsiUnit: '\\metre\\tothe{2}\\gram\\tothe{-1}', factor: 1 },
    'cm2/g': { dsiUnit: '\\centi\\metre\\tothe{2}\\gram\\tothe{-1}', factor: 1 },
    'cm²/g': { dsiUnit: '\\centi\\metre\\tothe{2}\\gram\\tothe{-1}', factor: 1 },

    // --- Mass ---
    'mg': { dsiUnit: '\\milli\\gram', factor: 1e-6 }, 
    'g': { dsiUnit: '\\gram', factor: 0.001 },       
    'kg': { dsiUnit: '\\kilogram', factor: 1 },
    'ug': { dsiUnit: '\\micro\\gram', factor: 1e-9 },
    'µg': { dsiUnit: '\\micro\\gram', factor: 1e-9 },
    'μg': { dsiUnit: '\\micro\\gram', factor: 1e-9 },
    
    'lb': { dsiUnit: '\\kilogram', factor: 0.45359237 },
    'oz': { dsiUnit: '\\kilogram', factor: 0.02834959 },
    't': { dsiUnit: '\\tonne', factor: 1000 }, 

    // --- Length ---
    'nm': { dsiUnit: '\\nano\\metre', factor: 1e-9 },
    'µm': { dsiUnit: '\\micro\\metre', factor: 1e-6 },
    'μm': { dsiUnit: '\\micro\\metre', factor: 1e-6 }, // Greek mu
    'um': { dsiUnit: '\\micro\\metre', factor: 1e-6 },
    'mm': { dsiUnit: '\\milli\\metre', factor: 0.001 },
    'cm': { dsiUnit: '\\centi\\metre', factor: 0.01 },
    'm': { dsiUnit: '\\metre', factor: 1 },
    'km': { dsiUnit: '\\kilo\\metre', factor: 1000 },
    
    'inch': { dsiUnit: '\\metre', factor: 0.0254 },
    'in': { dsiUnit: '\\metre', factor: 0.0254 },
    'ft': { dsiUnit: '\\metre', factor: 0.3048 },
    'mi': { dsiUnit: '\\metre', factor: 1609.344 },

    // --- Area ---
    'm2': { dsiUnit: '\\metre\\tothe{2}', factor: 1 },
    'm²': { dsiUnit: '\\metre\\tothe{2}', factor: 1 },
    'cm2': { dsiUnit: '\\centi\\metre\\tothe{2}', factor: 0.0001 },
    'cm²': { dsiUnit: '\\centi\\metre\\tothe{2}', factor: 0.0001 },
    
    // --- Density ---
    'g/cm3': { dsiUnit: '\\gram\\centi\\metre\\tothe{-3}', factor: 1 },
    'g/cm³': { dsiUnit: '\\gram\\centi\\metre\\tothe{-3}', factor: 1 },

    // --- Temperature ---
    '°C': { dsiUnit: '\\degreecelsius', factor: 1 },
    'C': { dsiUnit: '\\degreecelsius', factor: 1 },
    'K': { dsiUnit: '\\kelvin', factor: 1 },
    
    // --- Time ---
    'h': { dsiUnit: '\\hour', factor: 3600 }, 
    'min': { dsiUnit: '\\minute', factor: 60 },
    's': { dsiUnit: '\\second', factor: 1 },
    
    // --- Volume ---
    'L': { dsiUnit: '\\litre', factor: 0.001 }, 
    'l': { dsiUnit: '\\litre', factor: 0.001 },
    'mL': { dsiUnit: '\\milli\\litre', factor: 1e-6 },
    'ml': { dsiUnit: '\\milli\\litre', factor: 1e-6 },
    
    // --- Pressure ---
    'Pa': { dsiUnit: '\\pascal', factor: 1 },
    'bar': { dsiUnit: '\\pascal', factor: 100000 },
    'mbar': { dsiUnit: '\\pascal', factor: 100 },
    'hPa': { dsiUnit: '\\pascal', factor: 100 },
};

export const convertToDSI = (value: string | undefined | null | number, unit: string | undefined | null): { dsiValue: string, dsiUnit: string } => {
    // 1. Safety check for value
    if (value === undefined || value === null) {
        return { dsiValue: "", dsiUnit: "" };
    }
    
    // Ensure value is a string before processing
    const valStr = String(value);

    // 2. Safety check for unit
    if (unit === undefined || unit === null) {
         // Some values are dimensionless or just don't have units
         return { dsiValue: "", dsiUnit: "" };
    }

    const safeUnit = String(unit);
    
    // 3. Normalize Unit
    // Remove "in " prefix (case insensitive), often found in table headers like "in mg/kg"
    let cleanUnit = safeUnit.replace(/^\s*in\s+/i, '').trim();
    
    // Remove all whitespace
    cleanUnit = cleanUnit.replace(/\s+/g, '');
    
    // Try direct lookup
    let conversion = UNIT_MAP[cleanUnit];
    
    // Try case-insensitive lookup
    if (!conversion) {
         const lowerKey = Object.keys(UNIT_MAP).find(k => k.toLowerCase() === cleanUnit.toLowerCase());
         if (lowerKey) conversion = UNIT_MAP[lowerKey];
    }

    // Fallback: Try normalizing complex units manually
    if (!conversion) {
        // Replace unicode superscript -1 with -1
        cleanUnit = cleanUnit.replace(/⁻¹/g, '-1').replace(/⁻/g, '-').replace(/¹/g, '1').replace(/²/g, '2').replace(/³/g, '3');
        conversion = UNIT_MAP[cleanUnit];
        
        // Try case-insensitive again after normalization
        if (!conversion) {
             const lowerKey = Object.keys(UNIT_MAP).find(k => k.toLowerCase() === cleanUnit.toLowerCase());
             if (lowerKey) conversion = UNIT_MAP[lowerKey];
        }
    }

    // 4. Parse Value
    // Remove typical prefix operators like <, >, ~ for calculation
    const numStr = valStr.replace(/[^0-9.eE-]/g, ''); 
    const numValue = parseFloat(numStr);

    if (conversion && !isNaN(numValue)) {
        let finalValue = numValue * conversion.factor;
        
        // Format to avoid floating point artifacts
        let formattedValue = finalValue.toString();
        
        // For small numbers or large conversions, precision matters
        if (conversion.factor !== 1) {
             // Avoid 0.500000001 artifacts
             formattedValue = Number(finalValue.toPrecision(6)).toString();
        } else {
            // If factor is 1, try to preserve original string format if it was just a unit swap
            formattedValue = numStr;
        }

        return {
            dsiValue: formattedValue,
            dsiUnit: conversion.dsiUnit
        };
    }

    // Fallback: Return empty D-SI fields
    return { dsiValue: "", dsiUnit: "" };
};
