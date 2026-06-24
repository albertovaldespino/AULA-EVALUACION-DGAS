const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const root = __dirname;
const port = Number(process.env.PORT || 8765);
const statePath = path.join(root, "server-state.json");
const contentPath = path.join(root, "content.json");
const adminPassword = process.env.ADMIN_PASSWORD || "DGAS2026!";
const adminToken = process.env.ADMIN_TOKEN || `admin-${Math.random().toString(36).slice(2)}-${Date.now()}`;
let data = loadContent();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const surveyQuestions = ["S1", "S2", "S3", "S4", "S5"];
const examQuestionCount = 15;
const clients = new Set();
let state = loadState();

function enrichContent(content) {
  content.platformName = content.platformName || "AulaPulso Evalua";
  content.organization = content.organization || "Dirección General de Atención a la Salud";
  content.subtitle = content.subtitle || "Plataforma de evaluación y mejora continua de cursos";
  content.course = content.course || "Curso Introductorio de Ultrasonido";
  content.examTitle = content.examTitle || "Examen Final";
  content.participants = content.participants || [];
  content.questions = content.questions || [];
  content.participants.forEach((person, index) => {
    person.userNumber = person.userNumber || `U${String(index + 1).padStart(3, "0")}`;
    person.password = person.password || String(7401 + index);
  });
  return content;
}

function loadContent() {
  try {
    return enrichContent(JSON.parse(fs.readFileSync(contentPath, "utf8")));
  } catch {
    const content = enrichContent(JSON.parse(fs.readFileSync(path.join(root, "data.json"), "utf8")));
    fs.writeFileSync(contentPath, JSON.stringify(content, null, 2));
    return content;
  }
}

function saveContent() {
  fs.writeFileSync(contentPath, JSON.stringify(data, null, 2));
  fs.writeFileSync(path.join(root, "app-data.js"), `window.EXAM_DATA = ${JSON.stringify(publicContent(), null, 2)};\n`);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { attempts: {} };
  }
}

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function participantById(id) {
  return data.participants.find((person) => person.id === id);
}

function publicParticipant(person) {
  const { password, ...safePerson } = person;
  return safePerson;
}

function publicContent() {
  return {
    ...data,
    participants: data.participants.map(publicParticipant),
  };
}

function singleAttemptState(participantId) {
  const attempt = state.attempts[participantId];
  return { attempts: attempt ? { [participantId]: attempt } : {} };
}

function adminAuthorized(req) {
  const url = new URL(req.url, `http://${req.headers.host || "aulapulso.local"}`);
  return req.headers["x-admin-token"] === adminToken || url.searchParams.get("token") === adminToken;
}

function requireAdmin(req, res) {
  if (adminAuthorized(req)) return true;
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Administrador no autorizado" }));
  return false;
}

function verifyParticipant(body) {
  const person = participantById(body.participantId);
  if (!person) return null;
  if (body.password && String(person.password) === String(body.password)) return person;
  if (!body.password) return person;
  return null;
}

function attemptFor(participantId) {
  if (!state.attempts[participantId]) {
    state.attempts[participantId] = {
      participantId,
      answers: {},
      survey: {},
      startedAt: new Date().toISOString(),
      submittedAt: null,
      score: null,
      email: "",
      emailStatus: "",
      practice: {},
    };
  }
  if (!state.attempts[participantId].survey) state.attempts[participantId].survey = {};
  if (!state.attempts[participantId].examQuestionIds) state.attempts[participantId].examQuestionIds = selectQuestionIds(participantId);
  return state.attempts[participantId];
}

function publicState() {
  return state;
}

function adminState() {
  const rows = data.participants.map((person) => {
    const attempt = state.attempts[person.id] || {};
    const answered = Object.keys(attempt.answers || {}).length;
    const surveyAnswered = Object.keys(attempt.survey || {}).length;
    const assigned = attempt.examQuestionIds?.length || examQuestionCount;
    return {
      ...person,
      startedAt: attempt.startedAt || null,
      submittedAt: attempt.submittedAt || null,
      answers: attempt.answers || {},
      survey: attempt.survey || {},
      score: attempt.score || null,
      email: attempt.email || "",
      emailStatus: attempt.emailStatus || "",
      emailSentAt: attempt.emailSentAt || null,
      answered,
      surveyAnswered,
      examQuestionIds: attempt.examQuestionIds || [],
      progress: Math.round(((answered + surveyAnswered) / (assigned + surveyQuestions.length)) * 100),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    totalParticipants: data.participants.length,
    examQuestions: examQuestionCount,
    surveyQuestions: surveyQuestions.length,
    rows,
  };
}

function sendJson(res, value) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function selectQuestionIds(seedText) {
  const questions = data.questions.map((question) => Number(question.id)).filter(Boolean);
  let seed = 0;
  for (const char of String(seedText)) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const shuffled = [...questions].sort((a, b) => {
    const va = Math.sin(a * 999 + seed) % 1;
    const vb = Math.sin(b * 999 + seed) % 1;
    return va - vb;
  });
  return shuffled.slice(0, Math.min(examQuestionCount, shuffled.length));
}

function gradeAttempt(attempt) {
  const ids = attempt.examQuestionIds || selectQuestionIds(attempt.participantId);
  const correct = data.questions.filter((question) => ids.includes(Number(question.id)) && attempt.answers?.[question.id] === question.correct).length;
  return {
    correct,
    total: ids.length,
    percent: Math.round((correct / ids.length) * 100),
  };
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function assetDataUri(filename, mimeType) {
  try {
    return `data:${mimeType};base64,${fs.readFileSync(path.join(root, "assets", filename)).toString("base64")}`;
  } catch {
    return "";
  }
}

function selectedQuestionsForAttempt(attempt) {
  const ids = attempt.examQuestionIds || selectQuestionIds(attempt.participantId);
  return ids.map((id) => data.questions.find((question) => Number(question.id) === Number(id))).filter(Boolean);
}

function optionText(question, key) {
  return question.options.find((option) => option.key === key)?.text || "";
}

function buildResultEmailHtml(person, attempt) {
  const score = attempt.score || gradeAttempt(attempt);
  const unamLogo = assetDataUri("unam-escudo-azul.webp", "image/webp");
  const saludLogo = assetDataUri("logo-salud-unam.png", "image/png");
  const rows = selectedQuestionsForAttempt(attempt)
    .map((question, index) => {
      const picked = attempt.answers?.[question.id] || "";
      const timedOut = picked === "__TIMEOUT__";
      const ok = picked === question.correct;
      const chosen = timedOut ? "Sin respuesta por tiempo agotado" : optionText(question, picked) || "Sin respuesta";
      const correct = optionText(question, question.correct);
      return `
        <tr>
          <td style="padding:14px;border-bottom:1px solid #e8eef8;vertical-align:top;width:92px;">
            <strong style="color:${ok ? "#28a76f" : "#e85d75"};">Reactivo ${index + 1}</strong><br />
            <span style="font-size:12px;color:#63708a;">${ok ? "Correcto" : "Reforzar"}</span>
          </td>
          <td style="padding:14px;border-bottom:1px solid #e8eef8;vertical-align:top;">
            <div style="font-weight:700;color:#14213d;margin-bottom:8px;">${escapeHtml(question.prompt)}</div>
            <div style="font-size:14px;color:#4d5e78;margin-bottom:4px;"><strong>Tu respuesta:</strong> ${timedOut ? "" : `${escapeHtml(picked)}) `}${escapeHtml(chosen)}</div>
            <div style="font-size:14px;color:#4d5e78;margin-bottom:4px;"><strong>Respuesta correcta:</strong> ${escapeHtml(question.correct)}) ${escapeHtml(correct)}</div>
            <div style="font-size:14px;color:#4d5e78;"><strong>Retroalimentación:</strong> ${escapeHtml(question.feedback || "Revisa el material del curso para reforzar este tema.")}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Resultado de evaluación</title>
  </head>
  <body style="margin:0;background:#edf8fb;font-family:Arial,Helvetica,sans-serif;color:#14213d;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#d8f4ef,#eaf4ff 48%,#ffe3f1);padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="760" cellspacing="0" cellpadding="0" style="max-width:760px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 22px 60px rgba(31,52,92,.16);">
            <tr>
              <td style="padding:24px 30px;background:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="width:86px;">${unamLogo ? `<img src="${unamLogo}" alt="Escudo UNAM" style="width:70px;height:auto;display:block;" />` : ""}</td>
                    <td>
                      <div style="font-size:13px;font-weight:700;color:#61708c;">${escapeHtml(data.organization || "Dirección General de Atención a la Salud")}</div>
                      <div style="font-size:28px;line-height:1.05;font-weight:900;color:#263b93;">${escapeHtml(data.platformName || "AulaPulso Evalua")}</div>
                      <div style="font-size:14px;font-weight:700;color:#61708c;">${escapeHtml(data.course || "Curso Introductorio de Ultrasonido")}</div>
                    </td>
                    <td align="right" style="width:130px;">${saludLogo ? `<img src="${saludLogo}" alt="Salud UNAM" style="width:108px;height:auto;display:block;" />` : ""}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px;background:linear-gradient(135deg,#263b93,#6651f0);color:#ffffff;">
                <div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;opacity:.9;">Resultado registrado</div>
                <h1 style="margin:8px 0 6px;font-size:34px;line-height:1.05;">${escapeHtml(person.name)}</h1>
                <div style="font-size:15px;opacity:.92;">${escapeHtml(person.folio)} · ${escapeHtml(person.site)} · ${escapeHtml(person.career)}</div>
                <div style="margin-top:22px;display:inline-block;background:#ffffff;color:#263b93;border-radius:18px;padding:18px 24px;font-size:24px;font-weight:900;">
                  Calificación: ${score.correct}/${score.total}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 30px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#4d5e78;">
                  Gracias por completar la evaluación. Abajo encontrarás tus reactivos correctos e incorrectos con retroalimentación para reforzar los puntos clave del tema.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8eef8;border-radius:16px;overflow:hidden;">
                  ${rows}
                </table>
                <p style="margin:24px 0 0;font-size:16px;line-height:1.55;color:#263b93;font-weight:800;">
                  Tu participación ayuda a mejorar la enseñanza clínica y la atención a las personas.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResultEmail(person, attempt) {
  if (!attempt.email) {
    attempt.emailStatus = "error: participante sin correo";
    console.error(`[EMAIL] No se envio resultado: participante ${person.userNumber || person.folio} no tiene correo registrado.`);
    return;
  }
  const html = buildResultEmailHtml(person, attempt);
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    attempt.emailStatus = "error: falta BREVO_API_KEY";
    console.error(`[EMAIL] No se envio resultado a ${attempt.email}. Falta BREVO_API_KEY en Render.`);
    return;
  }

  try {
    const payload = {
      sender: {
        name: "Aula Evaluación DGAS",
        email: "aulaevaluaciondgas@gmail.com",
      },
      to: [
        {
          email: attempt.email,
          name: person.name,
        },
      ],
      subject: `Resultado de evaluación - ${data.course || "AulaPulso Evalua"}`,
      htmlContent: html,
    };
    console.log(`[EMAIL] Enviando resultado por Brevo API a ${attempt.email} desde Aula Evaluacion DGAS <aulaevaluaciondgas@gmail.com>.`);
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    let responseBody = null;
    try {
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = responseText;
    }

    if (!response.ok) {
      const detail = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
      throw new Error(`Brevo HTTP ${response.status}: ${detail}`);
    }

    attempt.emailStatus = "sent";
    attempt.emailSentAt = new Date().toISOString();
    attempt.emailMessageId = responseBody?.messageId || "";
    console.log(`[EMAIL] Resultado enviado correctamente por Brevo a ${attempt.email}. messageId=${attempt.emailMessageId || "sin-id"}`);
  } catch (error) {
    attempt.emailStatus = `error: ${error.message}`;
    console.error(`[EMAIL] Error al enviar resultado por Brevo a ${attempt.email}. ${error.stack || error.message}`);
  }
}

function broadcast() {
  const payload = `data: ${JSON.stringify(adminState())}\n\n`;
  for (const res of clients) res.write(payload);
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/content") return sendJson(res, publicContent());
  if (req.method === "GET" && req.url.startsWith("/api/admin/content")) {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, data);
  }
  if (req.method === "GET" && req.url === "/api/state") return sendJson(res, { attempts: {} });

  if (req.method === "POST" && req.url === "/api/login") {
    const body = await readBody(req);
    const userNumber = String(body.userNumber || "").trim().toUpperCase();
    const password = String(body.password || "").trim();
    const person = data.participants.find((item) => String(item.userNumber).toUpperCase() === userNumber && String(item.password) === password);
    if (!person) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: "Usuario o contraseña incorrectos" }));
    }
    return sendJson(res, { participant: publicParticipant(person), state: singleAttemptState(person.id) });
  }

  if (req.method === "POST" && req.url === "/api/admin/login") {
    const body = await readBody(req);
    if (String(body.password || "") !== adminPassword) {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: "Contraseña de administrador incorrecta" }));
    }
    return sendJson(res, { token: adminToken });
  }

  if (req.method === "GET" && req.url.startsWith("/api/admin/state")) {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, adminState());
  }

  if (req.method === "GET" && req.url.startsWith("/api/admin/events")) {
    if (!requireAdmin(req, res)) return;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    clients.add(res);
    res.write(`data: ${JSON.stringify(adminState())}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/start") {
    const body = await readBody(req);
    const person = verifyParticipant(body);
    if (!person) {
      res.writeHead(401);
      return res.end("Participante no autorizado");
    }
    const attempt = attemptFor(person.id);
    const email = normalizeEmail(body.email);
    if (email) attempt.email = email;
    saveState();
    broadcast();
    return sendJson(res, singleAttemptState(person.id));
  }

  if (req.method === "POST" && req.url === "/api/answer") {
    const body = await readBody(req);
    const person = verifyParticipant(body);
    if (!person) {
      res.writeHead(401);
      return res.end("Participante no autorizado");
    }
    const attempt = attemptFor(person.id);
    if (body.kind === "survey") {
      attempt.survey[String(body.questionId)] = String(body.answer);
    } else {
      if (attempt.submittedAt) return sendJson(res, singleAttemptState(person.id));
      if (attempt.answers[String(body.questionId)]) return sendJson(res, singleAttemptState(person.id));
      attempt.answers[String(body.questionId)] = String(body.answer);
    }
    attempt.lastUpdate = new Date().toISOString();
    saveState();
    broadcast();
    return sendJson(res, singleAttemptState(person.id));
  }

  if (req.method === "POST" && req.url === "/api/submit") {
    const body = await readBody(req);
    const person = verifyParticipant(body);
    if (!person) {
      res.writeHead(401);
      return res.end("Participante no autorizado");
    }
    const attempt = attemptFor(person.id);
    const email = normalizeEmail(body.email);
    if (email) attempt.email = email;
    if (!attempt.submittedAt) {
      attempt.submittedAt = new Date().toISOString();
      attempt.score = gradeAttempt(attempt);
      await sendResultEmail(person, attempt);
    } else if (attempt.email && attempt.emailStatus !== "sent") {
      await sendResultEmail(person, attempt);
    }
    saveState();
    broadcast();
    return sendJson(res, singleAttemptState(person.id));
  }

  if (req.method === "POST" && req.url === "/api/admin/content") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    data.platformName = String(body.platformName || data.platformName || "AulaPulso Evalua").trim();
    data.organization = String(body.organization || data.organization || "Dirección General de Atención a la Salud").trim();
    data.subtitle = String(body.subtitle || data.subtitle || "").trim();
    data.course = String(body.course || data.course || "").trim();
    data.examTitle = String(body.examTitle || data.examTitle || "").trim();
    saveContent();
    broadcast();
    return sendJson(res, data);
  }

  if (req.method === "POST" && req.url === "/api/admin/participant") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const participant = {
      id: String(body.id || body.name || `PARTICIPANTE${Date.now()}`).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      folio: String(body.folio || `USR-${Date.now()}`).trim(),
      name: String(body.name || "").trim().toUpperCase(),
      career: String(body.career || "").trim().toUpperCase(),
      site: String(body.site || "").trim().toUpperCase(),
      userNumber: String(body.userNumber || "").trim().toUpperCase(),
      password: String(body.password || "").trim(),
      sessions: body.sessions || [],
    };
    if (!participant.userNumber) participant.userNumber = `U${String(data.participants.length + 1).padStart(3, "0")}`;
    if (!participant.password) participant.password = String(7401 + data.participants.length);
    const index = data.participants.findIndex((person) => person.id === participant.id);
    if (index >= 0) data.participants[index] = { ...data.participants[index], ...participant };
    else data.participants.push(participant);
    saveContent();
    broadcast();
    return sendJson(res, data);
  }

  if (req.method === "POST" && req.url === "/api/admin/delete-participant") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    data.participants = data.participants.filter((person) => person.id !== body.id);
    delete state.attempts[body.id];
    saveContent();
    saveState();
    broadcast();
    return sendJson(res, data);
  }

  if (req.method === "POST" && req.url === "/api/admin/question") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const id = body.id ? Number(body.id) : Math.max(0, ...data.questions.map((question) => Number(question.id) || 0)) + 1;
    const question = {
      id,
      prompt: String(body.prompt || "").trim(),
      options: ["A", "B", "C", "D"].map((key) => ({ key, text: String(body.options?.[key] || "").trim() })),
      correct: String(body.correct || "A").trim().toUpperCase(),
      feedback: String(body.feedback || "").trim(),
      annotation: String(body.annotation || "").trim(),
      images: Array.isArray(body.images) ? body.images : [],
    };
    if (body.imageData && body.imageName) {
      const extension = path.extname(body.imageName).toLowerCase() || ".png";
      const safeName = `uploaded-${Date.now()}${extension}`;
      const target = path.join(root, "assets", safeName);
      const base64 = String(body.imageData).split(",").pop();
      fs.writeFileSync(target, Buffer.from(base64, "base64"));
      question.images.push(`assets/${safeName}`);
    }
    const index = data.questions.findIndex((item) => Number(item.id) === Number(id));
    if (index >= 0) data.questions[index] = question;
    else data.questions.push(question);
    data.questions.sort((a, b) => Number(a.id) - Number(b.id));
    saveContent();
    broadcast();
    return sendJson(res, data);
  }

  if (req.method === "POST" && req.url === "/api/admin/delete-question") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    data.questions = data.questions.filter((question) => Number(question.id) !== Number(body.id));
    saveContent();
    broadcast();
    return sendJson(res, data);
  }

  return false;
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, relative));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      const handled = await handleApi(req, res);
      if (handled === false) {
        res.writeHead(404);
        res.end("Not found");
      }
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end("Server error");
  }
});

server.listen(port, "0.0.0.0", () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}/`);
  console.log(`App participante lista en el puerto ${port}`);
  console.log(`Panel administrador listo en /admin.html`);
  console.log(`Contraseña admin: ${adminPassword}`);
  if (addresses.length) {
    console.log("Direcciones para la red del auditorio:");
    for (const address of addresses) console.log(`  ${address}`);
    console.log(`Panel admin en red: ${addresses[0]}admin.html`);
  }
});
