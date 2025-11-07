import express from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import cors from 'cors';


const app = express();
const port = 4000;
// Use CORS middleware to allow requests from your frontend origin
// For development, you can allow all origins:
app.use(cors());
// Initialize the Gemini client. It automatically uses the GEMINI_API_KEY env variable.
const ai = new GoogleGenAI({});
app.use(express.json());
// health endpoint for App Runner / health checks
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});
// --- Database simulation using JSON file ---
const DB_PATH = "./formMappings.json";

// Helper function to safely load existing mappings
const loadDB = () => {
  try {
    return fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : {};
  } catch (error) {
    console.error("Error loading DB file:", error.message);
    return {};
  }
};

// Helper function to save mappings
const saveDB = (data) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving DB file:", error.message);
  }
};

// === Route: Auto Map Form ===
app.post("/api/auto-map", async (req, res) => {
  try {
    const { page_url, fields } = req.body;

    if (!page_url || !fields) {
      return res.status(400).json({ error: "Missing 'page_url' or 'fields' in request body" });
    }

    const db = loadDB();

    // ✅ Check cache first
    if (db[page_url]) {
      console.log("✅ Cached mapping found for:", page_url);
      return res.json({ ...db[page_url], cached: true });
    }

    // ❌ Not cached → call Gemini
    console.log("⚙️ Generating new mapping for:", page_url);

    const prompt = `
You are a form-understanding AI that generates realistic Indian applicant data and a mapping for an autofill extension.

Given:
- The extracted form field JSON (each field has label, selector_id, selector_name, input_type, etc.)
- The current page URL: ${page_url}

Produce TWO things in JSON:
1️⃣ userProfile — a realistic, Indian-style applicant profile suitable for this form (names, DOB, email, mobile, etc.).
2️⃣ mappedFields — array of objects matching each field label to the correct value from userProfile. Each object must include:
   - label
   - suggested_value
   - selector_id / selector_name / selector_css (copy from input JSON)
   - status ("ready" if filled, "empty" otherwise)
   - input_type, tag_name, options (if any)

Rules:
- All data must look authentically Indian.
- Full names, father/mother names, etc. should be in Indian context.
- Use “Ramesh Sharma”, “Mahesh Sharma”, “Sunita Sharma”, “India”, realistic mobile/email.
- Use Indian date format DD/MM/YYYY.
- Match dropdowns exactly (return option text that exists).
- Do not output explanations — only the final JSON object.

Example Output:
{
  "userProfile": {
    "fullName": "Ramesh Sharma",
    "dob": "15/08/1996",
    "gender": "Male",
    "fatherName": "Mahesh Sharma",
    "motherName": "Sunita Sharma",
    "email": "ramesh.sharma96@gmail.com",
    "mobileNumber": "9876543210",
    "password": "SecurePassword@2025",
    "confirmPassword": "SecurePassword@2025"
  },
  "mappedFields": [
    { "label": "Full Name", "suggested_value": "Ramesh Sharma" },
    { "label": "Date of Birth", "suggested_value": "15/08/1996" },
    { "label": "Gender", "suggested_value": "Male" }
  ]
}

Now create the output for this form:
${JSON.stringify(fields, null, 2)}
`;


    // --- Gemini API call using the SDK and gemini-2.5-pro model ---
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Explicitly using the Pro model
      contents: [{ parts: [{ text: prompt }] }],
    });

    const text = response.text.trim();
    
    // Clean up potential markdown formatting (e.g., ```json ... ```)
    const jsonString = text.replace(/^```json\s*|^\s*```|```json\s*|```/g, '').trim();

    const parsed = JSON.parse(jsonString);

    // store in DB
    db[page_url] = parsed;
    saveDB(db);

    return res.json({ ...parsed, cached: false });

  } catch (err) {
    console.error("❌ Error in auto-map:", err.message);
    // Return the specific error message if possible
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
