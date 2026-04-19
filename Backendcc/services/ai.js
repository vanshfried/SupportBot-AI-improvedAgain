import OpenAI from "openai";
import dotenv from "dotenv";

import {
  getMessages,
  startHumanSession,
} from "../store/conversations.js";
import { pool } from "../db.js"; // ✅ ADD

let departments = []; // 🔥 will replace static import

function isValidName(name) {
  return /^[a-zA-Z\s]{2,50}$/.test(name.trim());
}

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
export const greetedUsers = {};
const collectedInfo = {};

import { yesWords, noWords } from "../services/departments.js";

/* =========================
   MAIN MESSAGE PROCESSOR
========================= */

export async function processMessage(user, text) {

  const msg = text.toLowerCase().trim();

  // 🔥 FORCE RESET ON NEW GREETING AFTER CHAT ENDED
if (isGreeting(msg) && !userState[user]) {
  greetedUsers[user] = false;
}

  // 🔥 END CONVERSATION (MUST BE FIRST BEFORE HUMAN BLOCK)
  if (
    userState[user] === "human_active" &&
    msg.includes("end conversation")
  ) {
    delete userState[user];
    delete predictedDept[user];
    delete collectedInfo[user];
    greetedUsers[user] = false;

    return "🛑 The conversation was ended by the crew.";
  }

  // 🚫 HARD BLOCK: if human is active, AI should not respond
  if (userState[user] === "human_active") {
    return null;
  }

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

  const department = await predictDepartment(text);

  if (department.name !== "General Inquiry") {
    predictedDept[user] = department;
    userState[user] = "awaiting_confirmation";

    return `It looks like you want *${department.name}*.

Do you want me to connect you?

Reply Yes or No`;
  }

  return await runAIChat(user, text);
}

  /* CONFIRMATION */

  if (userState[user] === "awaiting_confirmation") {
    if (yesWords.some((w) => msg.includes(w))) {
      const dept = predictedDept[user];

      // General Inquiry → AI chat
      if (dept.name === "General Inquiry") {
        userState[user] = "ai_chat";
        return "Sure! I'll help you with that.";
      }

      // Other departments → start data collection
      collectedInfo[user] = {
        deptId: dept.id,
        deptName: dept.name
      };

      userState[user] = "awaiting_user_name";

      return "Great 👍 Please enter your full name:";
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

  /* =========================
     USER NAME COLLECTION
  ========================= */

  if (userState[user] === "awaiting_user_name") {
    if (!isValidName(text)) {
      return "❌ Please enter a valid name (letters only).";
    }

    collectedInfo[user].name = text.trim();
    userState[user] = "awaiting_client_name";

    return "Thanks! Now please enter your client name:";
  }

  /* =========================
     CLIENT NAME COLLECTION
  ========================= */

  if (userState[user] === "awaiting_client_name") {
    if (!isValidName(text)) {
      return "❌ Please enter a valid client name (letters only).";
    }

    const info = collectedInfo[user];

    info.clientName = text.trim();

    // 👉 NOW CONNECT HUMAN HERE
    startHumanSession(user, info.deptId);

    userState[user] = "human_active";

    delete predictedDept[user];
    delete collectedInfo[user];

    return `✅ Connecting you to *${info.deptName}* team.\nName: ${info.name}\nClient: ${info.clientName}`;
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
You are a WhatsApp assistant for GET Global Group.

STRICT LANGUAGE RULE (VERY IMPORTANT):
- Detect user's language
- Reply ONLY in english language
- If Hindi → reply english 
- If Hinglish → reply english

Company:
- Website: https://getglobalgroup.com/
- Services: Expertise Based Services, Procurement And Supply Chain Management, Integrated Maintenance Solutions, On Demand Energy Service

Rules:
- Max 3 sentences
- professional and warm tone
- If you don't know the answer, say "Sorry, I don't have that information right now."


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
You are a smart routing AI.

Detect if user INTENDS to talk to a department.

Examples:
- "I need visa help" → Visa Department
- "connect me to sales" → Sales
- "pricing?" → Sales

Return ONLY department name.

Departments:
${deptList}

Message:
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


function isGreeting(msg) {
  return ["hi", "hello", "hey", "start"].some((w) =>
    msg.includes(w)
  );
}


export function resetUserState(user) {
  delete userState[user];
  delete predictedDept[user];
  delete collectedInfo[user];

  greetedUsers[user] = false;
}
