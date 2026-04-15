import OpenAI from "openai";
import dotenv from "dotenv";

import {
  getMessages,
  startHumanSession,
} from "../store/conversations.js";
import { pool } from "../db.js"; // ✅ ADD

let departments = []; // 🔥 will replace static import

// load once
async function loadDepartments() {
  const res = await pool.query(`SELECT id, name FROM departments ORDER BY id`);
  departments = res.rows; // [{id, name}]
}

// 🔥 call immediately
loadDepartments();

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* MEMORY */

const userState = {};
const predictedDept = {};
const greetedUsers = {};

import { yesWords, noWords } from "../services/departments.js";

/* =========================
   MAIN MESSAGE PROCESSOR
========================= */

export async function processMessage(user, text) {
  // 🚫 HARD BLOCK: if human is active, AI should not respond
if (userState[user] === "human_active") {
  return null;
}
  const msg = text.toLowerCase().trim();

  
  if (!departments.length) {
    await loadDepartments();
  }

  /* GREETING */

  if (!greetedUsers[user]) {
    greetedUsers[user] = true;

    return "Hello! 👋 Welcome. How can I assist you today? Please tell me your enquiry.";
  }

  /* AI CHAT MODE */

  if (userState[user] === "ai_chat") {
    return await runAIChat(user, text);
  }

  /* CONFIRMATION */

  if (userState[user] === "awaiting_confirmation") {
    if (yesWords.some((w) => msg.includes(w))) {
      const dept = predictedDept[user];

      if (dept.name === "General Inquiry") {
        userState[user] = "ai_chat";

        return "Sure! I'll help you with that.";
      }

      startHumanSession(user, dept.id); // 🔥 ONLY CHANGE

      userState[user] = "human_active";
      delete userState[user];
      delete predictedDept[user];

      return `✅ Connecting you to *${dept.name}* team. A human will reply shortly.`;
    }

    if (noWords.some((w) => msg.includes(w))) {
      let list = "Please choose the correct department:\n\n";

      departments.forEach((d, i) => {
        list += `${i + 1}. ${d.name}\n`;
      });

      userState[user] = "choosing_department";

      return list;
    }

    return "Please reply Yes or No.";
  }

  /* MANUAL SELECT */

  if (userState[user] === "choosing_department") {
    const choice = parseInt(msg);

    if (!choice || choice < 1 || choice > departments.length) {
      return "Please send the number from the list.";
    }

    const selectedDept = departments[choice - 1];

    if (selectedDept.name === "General Inquiry") {
      userState[user] = "ai_chat";

      return "Sure! I'll help you.";
    }

    startHumanSession(user, selectedDept.id); // 🔥 ONLY CHANGE

    userState[user] = "human_active";
    delete userState[user];
    delete predictedDept[user];

    return `✅ Connecting you to *${selectedDept.name}* team. A human will reply shortly.`;
  }

  /* AI ROUTER */

  const department = await predictDepartment(text);

  predictedDept[user] = department;
  userState[user] = "awaiting_confirmation";

  return `I think your query belongs to *${department.name}*.

Is this correct?

Reply Yes or No`;
}

/* =========================
   AI CHAT
========================= */

async function runAIChat(user, text) {
  const history = await getMessages(user);

  const formatted = history.map((m) => {
    if (m.direction === "inbound") return `User: ${m.text}`;
    return `Assistant: ${m.text}`;
  });

  formatted.push(`User: ${text}`);

  const prompt = `
You are a friendly company WhatsApp assistant.

Language rules:
- Detect the user's language automatically.
- The user may speak English, Hindi, Hinglish, or a mix.
- Always reply in the SAME language the user used.
- If the message is mixed, reply in a natural mixed style.

Other rules:
- Keep answers short
- Maximum 3 sentences
- Be professional

Conversation:
${formatted.join("\n")}
`;

  try {
    const ai = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    return ai.output_text?.trim() || "Sorry, I couldn't answer that.";
  } catch (err) {
    console.error("AI Chat Error:", err.message);

    return "⚠️ I'm having trouble answering right now.";
  }
}

/* =========================
   DEPARTMENT PREDICTION
========================= */

async function predictDepartment(text) {
  const deptList = departments.map((d) => d.name).join("\n");

  const prompt = `
You are an AI that routes messages to departments.

The user may write in:
- English
- Hindi
- Hinglish
- Mixed language

Understand the meaning and choose the best department.

Return ONLY the department name from this list:

${deptList}

User message:
"${text}"
`;

  try {
    const ai = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const output = ai.output_text?.trim();

    const match = departments.find(
      (d) => d.name.toLowerCase() === output?.toLowerCase(),
    );

    return match || departments.find((d) => d.name === "General Inquiry");
  } catch (err) {
    console.error("Department AI Error:", err.message);

    return departments.find((d) => d.name === "General Inquiry");
  }
}
export function resetUserState(user) {
  delete userState[user];
  delete predictedDept[user];
}