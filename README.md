# Digital Reference Material Data Generator

**Status:** Internal Testing (v1.0.0-alpha)

## Overview

Managing reference material certificates involves extracting complex metadata and measurement data from PDFs, normalizing values across different units and formats, and integrating that data into standardized systems. This process is traditionally manual, error-prone, and difficult to scale.

The DRMD Generator is a web-based tool designed to automate and streamline this workflow. It leverages Vision Language Models (VLMs) to intelligently extract structured data from reference material certificates, then provides an intuitive interface for validation and correction. The result is standards-compliant DRMD/DCC-formatted XML that can be seamlessly integrated into reference material databases and downstream systems worldwide.

## Key Features

- **Intelligent extraction**: Uses vision-capable LLMs (Google Gemini) to extract text, tables, and metadata with precise coordinate tracking
- **Interactive verification**: Split-screen interface lets you review extracted data against the original PDF with visual highlighting
- **Repeatable workflow**: Normalized extraction with built-in unit conversion to D-SI canonical units
- **Standards-compliant output**: Exports validated XML conforming to DRMD/DCC schemas
- **Coordinate-backed validation**: Visual verification backed by precise bounding box coordinates for accuracy assurance

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm (or yarn)
- A Google Gemini API key (for extraction functionality)

### Installation & Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:5173` (or the URL shown in your terminal).

Before extracting data, configure your Gemini API key in the **Settings** tab.

## How It Works

The generator follows a straightforward three-stage workflow:

1. **Upload & Extraction**: Upload a reference material certificate PDF. The Gemini vision model analyzes the document and extracts structured data including text content, table information, and precise bounding box coordinates.

2. **Review & Correct**: The split-screen interface displays the extracted data alongside the original PDF. Visual highlights show exactly where each piece of data was detected. Edit any values that need correction—the highlighting updates in real-time.

3. **Validate & Export**: Run schema validation to ensure data integrity, then export a standards-compliant DRMD/DCC XML file ready for integration with your systems.

## Architecture

The codebase is organized around a clear separation of concerns:

| Module | Purpose |
|--------|---------|
| `App.tsx` | Main React component managing state, user interactions, and the extraction workflow |
| `services/llmService.ts` | Handles communication with Google Gemini; sends image data and receives structured extraction results |
| `utils/xmlGenerator.ts` | Converts in-memory DRMD data models into validated XML documents |
| `utils/xmlParser.ts` | Parses imported DRMD XML back into the application's data structure |
| `utils/unitConverter.ts` | Performs unit normalization and conversion to D-SI canonical units |
| `utils/casMapping.ts` | Provides CAS number standardization and validation helpers |

### Directory Structure

```
DRMDGenerator/
├── schema/                   # XML Schema Definition files
│   ├── dcc.xsd              # DCC (Digital Calibration Certificate) schema
│   ├── drmd.xsd             # DRMD (Digital Reference Material Document) schema
│   ├── SI_Format.xsd        # SI units and measurement format schema
│   └── xmldsig-core-schema.xsd # XML digital signature schema
├── services/                # External service integrations
│   └── llmService.ts        # Gemini vision API integration for extraction
├── utils/                   # Utility functions and helpers
│   ├── casMapping.ts        # CAS number normalization and validation
│   ├── unitConverter.ts     # Unit conversion and D-SI normalization
│   ├── xmlGenerator.ts      # Converts DRMD model to XML output
│   └── xmlParser.ts         # Parses imported DRMD XML into app model
├── document/                # Reference documentation and guides
│   ├── 2020_07-01_SmartCom_Deliverable_D1_Zenodo-2.pdf # DSI unit conversion reference
│   └── DRMD_BestPractice_0.0.9v.pdf # Reference Material best practices docuement
├── App.tsx                  # Main React application component
├── index.html               # HTML entry point
├── index.tsx                # React entry point and DOM mounting
├── metadata.json            # Project metadata and configuration
├── package.json             # npm dependencies and scripts
├── README.md                # This file
├── tsconfig.json            # TypeScript compiler configuration
├── types.ts                 # TypeScript type definitions and interfaces
├── vercel.json              # Vercel deployment configuration
└── vite.config.ts           # Vite build tool configuration
```



## Data Extraction & Verification

### Extraction Process

The extraction workflow leverages Gemini's vision capabilities with carefully tuned prompts to:

- Extract text content with high precision
- Identify and structure measurement tables
- Generate normalized coordinate information for visual verification: `[pageIndex, ymin, xmin, ymax, xmax]` on a 0–1000 normalized scale
- Preserve chemical formulas and special formatting
- Detect table-level metadata (coverage factors, probability estimates)

### Visual Highlighting

The interface supports two highlighting strategies to ensure accuracy:

1. **Coordinate overlay** (preferred): When Gemini returns precise coordinates, the UI renders a transparent overlay box on the PDF showing exactly which region was extracted. This provides confidence that the data came from the intended location.

2. **Text search fallback**: If coordinates are unavailable, the UI performs a fuzzy text search across the PDF's text layer and highlights matching content. While less precise than coordinate-based matching, this fallback ensures visibility even when coordinate data is incomplete.

## Validation & Export

Before exporting, the application validates:

- All required fields are present
- Unit values are consistent and convertible to D-SI
- XML structure conforms to DRMD/DCC schemas

The export process generates standards-compliant XML with proper namespace declarations and omits empty elements for qualitative quantities. The resulting file is ready for immediate integration with reference material databases and downstream processing systems.

## Development

### Setting Up a Development Environment

```bash
npm run dev              # Start the dev server with hot reload
npm run build           # Build for production
npm run type-check      # Run TypeScript type checking
```

### Code Conventions

- Follow the TypeScript and React patterns established in `App.tsx`
- When modifying coordinate calculations, test against certificate PDFs with known highlight positions
- Schema changes should be mirrored in `types.ts`, `xmlGenerator.ts`, and `xmlParser.ts`

### Testing & Debugging

1. Start the dev server and upload a reference material certificate
2. Configure a Gemini API key in Settings
3. Trigger extraction and inspect the JSON response in your browser's DevTools Network tab
4. Verify highlighted regions align with the original document—check the console for detailed coordinate logs and viewport information
5. Use the Editor tab to test manual corrections and ensure the preview updates correctly

## Resource Documentation

The following resources provide detailed guidance:

- **document/2020_07-01_SmartCom_Deliverable_D1_Zenodo-2.pdf**: Complete reference for DSI unit conversion logic, including edge cases like percentage handling and SI prefix mapping
- **document/DRMD_BestPractice_0.0.9v.pdf**: Best practices for certificate interpretation, naming conventions, and table extraction rules
- **schema/*.xsd**: Authoritative XML Schema Definition files; reference these when updating `xmlGenerator.ts` or making schema changes

