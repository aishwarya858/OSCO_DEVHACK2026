# OSCO: Patient Medical History Platform

OSCO is built for OSCO DevHack 2026, Problem Statement 7. It turns a patient's scattered medical documents (prescriptions, lab reports, discharge summaries) into **one clear medical history that the patient controls**.

- **Patients** upload their documents. OSCO reads them, pulls out the important facts and builds a timeline.
- **Doctors** see that history **only after the patient approves their request**.
- **Every finding links to its source.** It points back to the exact sentence and page of the original document, so nothing is shown without evidence.

---

## Table of contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Getting started](#getting-started)
6. [Creating accounts](#creating-accounts)
7. [Using the app](#using-the-app)
8. [Running the tests](#running-the-tests)
9. [Useful scripts](#useful-scripts)
10. [Known limitations](#known-limitations)
11. [Troubleshooting](#troubleshooting)

---

## What it does

### For patients
| Feature | What it means |
|---|---|
| **Patient ID and QR code** | Each patient gets an ID like `OSCO-XXXXXXXX` to share with a doctor. The ID alone gives the doctor no access. |
| **Upload documents** | Add PDFs or photos of medical documents. |
| **AI extraction with evidence** | Medicines, diagnoses, test results and allergies are pulled out of each document. Every finding must quote the document **word for word**, or it is rejected. |
| **Add to medical history** | The patient adds a document's findings to their history with one click. |
| **Medical history timeline** | All findings, sorted by the date written on the document. Click any finding to open the original page with the sentence highlighted. |
| **Documents library** | View every uploaded original, exactly as it was uploaded. |
| **Health Assistant (chatbot)** | Ask questions such as "What medications was I prescribed?". Answers come only from the patient's own records, and each one cites the document and page. It does not diagnose or give treatment advice. |
| **Doctor access control** | Approve, approve as view only, or deny each doctor's request. Access lasts 60 minutes and can be ended at any time. |

### For doctors
| Feature | What it means |
|---|---|
| **Verified doctors only** | A new doctor account stays *pending* until a hospital admin verifies it. |
| **Request access** | Enter the Patient ID, choose a reason (Consultation, Emergency care, Follow-up or Second opinion), and choose **View records** or **View and correct**. |
| **Report** | A one-page summary of medication history, allergies, recent tests, missing information and contradictions. |
| **Alert and Reviews** | Problems found across the history: contradictions, possible duplicates, missing results, inconsistent details and unconfirmed findings. Each comes with a reason and links to the evidence. Nothing is resolved automatically. |
| **Add clinical record** | Add a new diagnosis, prescription, test result or observation. It is saved under the doctor's name, and earlier records are left unchanged. |
| **Doctor Assistant** | The same cited chatbot, limited to this patient and available only while access is approved. |

### For hospital admins
- The **admin portal** (`/admin`) lists pending doctor registrations so an admin can verify or reject them.

---

## How it works

```
Patient uploads a document
        │
        ▼
Read the text ─────────► PDF.js for text-based PDFs (Tesseract OCR for scans and photos)
        │
        ▼
Classify the document ─► prescription, lab report, discharge summary, …
        │
        ▼
Extract findings ──────► Gemini AI suggests medicines, diagnoses, tests, allergies
        │
        ▼
Quote Verifier ────────► keep a finding only if its quote is found word for word on the page
        │
        ▼
Patient adds the findings to the medical history
        │
        ▼
Reconcile ─────────────► build medicine timelines, flag contradictions, gaps and duplicates
        │
        ▼
Doctor (with patient approval) sees the Report, Medical History and Alerts
```

**The chatbot (RAG)** searches the patient's confirmed findings, sends the most relevant ones to Gemini, and returns an answer with citations. The server checks every citation before the answer is shown. Each answer has a status: *Documented*, *Not documented* or *Outside scope*.

**Consent is checked on the server for every request.** It is never just hidden in the screen. Without an active, approved request, a doctor gets no data.

---

## Tech stack

| Part | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, lucide-react icons, `qrcode`, `react-pdf` |
| **Backend API** | Node.js, Express 5, PostgreSQL (`pg`), JWT login, bcrypt passwords, Helmet, Multer for uploads |
| **Worker** | Node.js, BullMQ job queue on Redis, PDF.js (`pdfjs-dist`), Tesseract OCR, Gemini (Groq optional) |
| **Database** | PostgreSQL. Original files are stored on disk, and only their metadata is in the database. |

---

## Project structure

```
OSCO_DEVHACK2026/
├── backend/            Express API (auth, documents, history, consent, chatbot, admin)
│   ├── migrations/     SQL files that create the database tables (run in order)
│   ├── scripts/        Helper scripts: create admin or doctor, verify doctor, re-check flags
│   ├── src/            Server code (routes, services, config)
│   └── tests/          Backend tests
├── worker/             Background document processing
│   ├── src/pipeline/   Read, classify, extract, verify quotes
│   ├── src/reconcile/  Contradictions, duplicates, gaps, medicine timelines
│   ├── src/llm/        Gemini or Groq client with model fallback
│   ├── src/cache/      Saved extraction results (by file hash)
│   └── tests/          Worker tests
├── frontend/           React app (patient, doctor and admin portals)
│   └── src/pages/      patient/, doctor/, admin/ and the login pages
├── data/  eval/        Sample data and evaluation scripts
└── docs/               Project notes
```

---

## Getting started

### 1. Install the prerequisites
- **Node.js** 20 or newer
- **PostgreSQL** 14 or newer
- **Redis** 6 or newer, running on port `6379`
- **A Gemini API key** from [Google AI Studio](https://aistudio.google.com/), or a Groq key
- *(Optional)* **Tesseract OCR**, needed only for scanned PDFs and photos

### 2. Clone and install
```bash
git clone https://github.com/aishwarya858/OSCO_DEVHACK2026.git
cd OSCO_DEVHACK2026

cd backend  && npm install && cd ..
cd worker   && npm install && cd ..
cd frontend && npm install && cd ..
```

### 3. Create the database
```sql
-- in psql
CREATE DATABASE osco_devhack;
```

### 4. Set up the environment files
Copy each example file and fill in your own values:

```bash
cp backend/.env.example  backend/.env
cp worker/.env.example   worker/.env
cp frontend/.env.example frontend/.env
```

| File | What to set |
|---|---|
| `backend/.env` | `DATABASE_URL`, a long random `JWT_SECRET`, and `GEMINI_API_KEY` |
| `worker/.env` | The same `DATABASE_URL`, `REDIS_URL`, and `GEMINI_API_KEY` |
| `frontend/.env` | `VITE_API_BASE_URL=http://localhost:3000` |

To generate a JWT secret:
```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

> `.env` files are git-ignored. Never commit real keys or passwords.

### 5. Create the tables
```bash
cd backend
npm run db:migrate
```

### 6. Start everything
Run each one in its own terminal, with Redis and PostgreSQL already running:

```bash
# Terminal 1: API on http://localhost:3000
cd backend && npm run dev

# Terminal 2: document processing worker
cd worker && npm start

# Terminal 3: web app on http://localhost:5173
cd frontend && npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Creating accounts

| Account | How to create it |
|---|---|
| **Patient** | Home page → **Patient sign up** |
| **Hospital admin** | Script only, as there is no admin sign-up page:<br>`cd backend`<br>`npm run admin:create -- --email admin@example.test --password "a-long-password" --name "Hospital Admin"` |
| **Doctor** | Home page → **Doctor sign up**. The account starts as *pending*. An admin then verifies it at `/admin`. |
| **Doctor (shortcut for testing)** | `npm run doctor:create -- --email dr@example.test --password "a-long-password" --name "Dr. Test" --license MCI-12345`<br>This creates an already-verified doctor. |

---

## Using the app

### Pages
| URL | Page |
|---|---|
| `/` | Home: choose patient or doctor |
| `/patient/login`, `/patient/signup` | Patient login and sign-up |
| `/patient` | Patient portal |
| `/doctor/login`, `/doctor/signup` | Doctor login and sign-up |
| `/doctor` | Doctor portal |
| `/admin/login`, `/admin` | Hospital admin portal |

### A full walkthrough
1. **Patient:** sign up, then open **Upload Documents** and add a PDF.
2. Wait until the document shows **Ready**, click **Review findings**, then **Add N findings to my medical history**.
3. Open **Medical History** and click a finding to see the highlighted source.
4. Open **Health Assistant** and ask "What medications were prescribed to me?".
5. Copy your **Patient ID** from the Dashboard.
6. **Doctor:** in a second browser window, sign in, enter the Patient ID, choose a reason and access type, and click **Request access**.
7. **Patient:** on the Dashboard, under **Doctor access**, click **Allow view and correct**, **Allow view only** or **Deny**.
8. **Doctor:** the record opens automatically. Check the **Report**, **Medical History** and **Alert and Reviews** tabs, add a prescription in **Add Changes**, and ask the **Doctor Assistant**.

> **Tip:** use two different browsers, or one normal and one private window, for the patient and the doctor.

---

## Running the tests

```bash
cd backend  && npm test        # API tests
cd worker   && npm test        # extraction and reconciliation tests
cd frontend && npm run lint    # code checks
cd frontend && npm run build   # type check and production build
```

---

## Useful scripts

All of these run from the `backend/` folder.

| Command | What it does |
|---|---|
| `npm run db:migrate` | Creates or updates the database tables |
| `npm run admin:create -- …` | Creates a hospital admin |
| `npm run doctor:create -- …` | Creates a doctor account (for testing) |
| `npm run doctor:verify -- --email <email>` | Marks a doctor as verified (for testing) |
| `npm run flags:recheck` | Re-runs the review checks for every patient. The worker must be running. |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Upload stays on **Processing** | Check that the worker and Redis are running and that `GEMINI_API_KEY` is set in `worker/.env`. |
| **Original file could not be loaded** | `DOCUMENT_STORAGE_DIR` must point to the same folder in `backend/.env` and `worker/.env`. |
| Chatbot says **AI service is busy** | The Gemini quota is used up. Wait a minute, or set `LLM_FALLBACK_MODELS`. |
| Doctor sees **Account pending** | An admin must verify the account at `/admin`, or run `npm run doctor:verify`. |
| Frontend can't reach the API | Check `VITE_API_BASE_URL` and that your frontend URL is listed in `CORS_ORIGINS` in `backend/.env`. |

---

Built for **OSCO DevHack 2026**.
