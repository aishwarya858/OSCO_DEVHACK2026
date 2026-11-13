/**
 * Mock data for the doctor's Emergency Brief (MVP document section 6.2.4).
 * SYNTHETIC. Replace this file (or the import in EmergencyBriefReport.jsx)
 * with the API response later; components only read the shapes below.
 *
 * Conventions
 * - Values, units and doses are kept exactly as written in the documents.
 * - `label` fields are display dates as written; `iso` fields (YYYY-MM or
 *   YYYY-MM-DD) are only used to position things on a ribbon or matrix.
 * - provenance: 'patient' | 'ai' | 'doctor' (Patient-provided, AI-extracted,
 *   Doctor-verified). 'computed' marks lines derived from the records themselves.
 * - Recorded facts only. No diagnosis, interpretation or advice.
 */

/** The 11 source documents. Every item points at one of these. */
export const DOCUMENTS = {
  apolloDischarge: { id: 'doc-01', name: 'Apollo Hospital discharge summary', date: '14 Aug 2018' },
  mehtaRx2019: { id: 'doc-02', name: 'Dr. Mehta prescription', date: '21 Mar 2019' },
  mehtaConsult2020: { id: 'doc-03', name: 'Dr. Mehta consultation', date: '18 Feb 2020' },
  mehtaConsult2021: { id: 'doc-04', name: 'Dr. Mehta consultation', date: '03 Feb 2021' },
  srlLab2021: { id: 'doc-05', name: 'SRL Diagnostics lab report', date: '18 Nov 2021' },
  mehtaRxNov2021: { id: 'doc-06', name: 'Dr. Mehta prescription', date: '22 Nov 2021' },
  mehtaRx2022: { id: 'doc-07', name: 'Dr. Mehta prescription', date: '14 Mar 2022' },
  fortisEcho2023: { id: 'doc-08', name: 'Fortis Hospital echocardiogram report', date: '16 Jan 2023' },
  metropolisLab2024: { id: 'doc-09', name: 'Metropolis lab report', date: '08 Jan 2024' },
  thyrocareLab2024: { id: 'doc-10', name: 'Thyrocare lab report', date: '08 Jan 2024' },
  mehtaFollowUp2024: { id: 'doc-11', name: 'Dr. Mehta follow-up consultation', date: '15 Jan 2024' },
};

/** Not a document: what the patient typed into their health details. */
export const PATIENT_PROVIDED = { id: 'patient-details', name: 'Patient-provided details', date: '12 Mar 2024' };

const D = DOCUMENTS;

/** Limited identification only: what a doctor may see before approval (6.2.2). */
export const PATIENT = {
  publicId: 'OSC-4821-7730',
  name: 'Anita Rao',
  age: 58,
  sex: 'Female',
};

export const BRIEF = {
  patient: PATIENT,
  updated: '12 Mar 2024',
  documentCount: Object.keys(DOCUMENTS).length,
  bloodGroup: { value: 'B+', provenance: 'patient' },
  /** Ribbon axis for Medication History */
  axis: { from: '2018-01', to: '2024-03', years: [2018, 2019, 2020, 2021, 2022, 2023, 2024] },

  medications: [
    {
      id: 'metformin',
      name: 'Metformin',
      provenance: 'ai',
      segments: [
        { dose: '500 mg', fromIso: '2018-08', fromLabel: 'Aug 2018', source: D.apolloDischarge },
        { dose: '1000 mg', fromIso: '2019-03', fromLabel: 'Mar 2019', source: D.mehtaRx2019 },
      ],
      stopped: { iso: '2022-03-14', label: '14 Mar 2022', source: D.mehtaRx2022 },
      statusText: 'Last prescribed 14 Mar 2022',
    },
    {
      id: 'amlodipine',
      name: 'Amlodipine',
      provenance: 'doctor',
      segments: [{ dose: '5 mg', fromIso: '2020-02', fromLabel: 'Feb 2020', source: D.mehtaConsult2020 }],
      lastRecord: { iso: '2024-01', label: 'Jan 2024', source: D.mehtaFollowUp2024 },
      statusText: 'Active as of last record, Jan 2024',
    },
    {
      id: 'atorvastatin',
      name: 'Atorvastatin',
      provenance: 'ai',
      segments: [
        // The 10 mg start date is not in any document, so it is drawn as unknown, not guessed.
        { dose: '10 mg', fromIso: null, fromLabel: 'start not documented', source: D.mehtaRxNov2021 },
        { dose: '20 mg', fromIso: '2021-11', fromLabel: 'Nov 2021', source: D.mehtaRxNov2021 },
      ],
      lastRecord: { iso: '2024-01', label: 'Jan 2024', source: D.mehtaFollowUp2024 },
      statusText: 'Active as of last record, Jan 2024',
    },
    {
      id: 'pantoprazole',
      name: 'Pantoprazole',
      provenance: 'ai',
      segments: [{ dose: '40 mg', fromIso: '2018-08', fromLabel: 'Aug 2018', source: D.apolloDischarge }],
      // The stop is recorded in the Nov 2021 prescription.
      stopped: { iso: '2021-06', label: 'Jun 2021', source: D.mehtaRxNov2021 },
      statusText: 'Stopped Jun 2021',
    },
  ],

  allergies: {
    documented: [
      { id: 'penicillin', substance: 'Penicillin', reaction: 'rash', asWritten: 'Allergy: Penicillin (rash)', provenance: 'ai', source: D.apolloDischarge, conflict: true },
    ],
    documentedAbsent: [
      { id: 'nkda', statement: 'No known drug allergies', provenance: 'ai', source: D.mehtaConsult2021, conflict: true },
    ],
    patientProvided: [
      { id: 'sulfa', substance: 'Sulfa drugs', reaction: 'itching', provenance: 'patient', source: PATIENT_PROVIDED },
    ],
  },

  investigations: [
    { id: 'fg', test: 'Fasting glucose', value: '126', unit: 'mg/dL', range: null, date: '08 Jan 2024', provenance: 'ai', source: D.metropolisLab2024, tags: [{ text: 'Possible duplicate', tone: 'ochre' }] },
    { id: 'creat', test: 'Serum creatinine', value: '1.1', unit: 'mg/dL', range: '0.6–1.2 mg/dL', date: '08 Jan 2024', provenance: 'doctor', source: D.metropolisLab2024, tags: [] },
    { id: 'hba1c', test: 'HbA1c', value: '7.8', unit: '%', range: '4.0–5.6 %', date: '18 Nov 2021', provenance: 'ai', source: D.srlLab2021, tags: [{ text: 'Older than 12 months', tone: 'ochre' }] },
  ],

  missing: {
    /** Dot matrix: rows = years, columns = months. */
    years: [2019, 2020, 2021, 2022, 2023, 2024],
    /** Months with at least one document. verified = at least one doctor-verified item from that month. */
    documentMonths: [
      { iso: '2019-03', verified: false },
      { iso: '2020-02', verified: true },
      { iso: '2021-02', verified: false },
      { iso: '2021-11', verified: true },
      { iso: '2022-03', verified: false },
      { iso: '2023-01', verified: true },
      { iso: '2024-01', verified: true },
    ],
    /** Months after the last update are not "missing", just not yet covered. */
    coveredUntil: '2024-03',
    /** The long empty stretch ringed in Ochre. */
    gapRanges: [{ fromIso: '2022-04', toIso: '2022-12' }],
    lines: [
      { id: 'gap-hba1c', text: 'No HbA1c after Nov 2021', provenance: 'computed' },
      { id: 'gap-2022', text: 'No records Mar to Dec 2022', provenance: 'computed' },
      { id: 'gap-imm', text: 'No immunization history', provenance: 'computed' },
    ],
  },

  conflicts: [
    {
      id: 'conflict-allergy',
      kind: 'contradiction',
      title: 'Penicillin allergy recorded, later "no known drug allergies"',
      sides: [
        { label: 'Apollo Hospital discharge summary, 14 Aug 2018', statement: 'Allergy: Penicillin (rash)', provenance: 'ai', source: D.apolloDischarge },
        { label: 'Dr. Mehta consultation, 03 Feb 2021', statement: 'No known drug allergies', provenance: 'ai', source: D.mehtaConsult2021 },
      ],
    },
    {
      id: 'conflict-glucose',
      kind: 'duplicate',
      title: 'Possible duplicate: Fasting glucose 126 mg/dL appears in two labs on 08 Jan 2024',
      sides: [
        { label: 'Metropolis lab report, 08 Jan 2024', statement: 'Fasting glucose 126 mg/dL', provenance: 'ai', source: D.metropolisLab2024 },
        { label: 'Thyrocare lab report, 08 Jan 2024', statement: 'Fasting glucose 126 mg/dL', provenance: 'ai', source: D.thyrocareLab2024 },
      ],
    },
  ],
};
