let examData = window.EXAM_DATA;
const surveyLabels = {
  S1: "Agrado del curso",
  S2: "Utilidad percibida",
  S3: "Curso mas amplio",
  S4: "Duracion ideal",
  S5: "Recomendacion",
};

let latestState = null;
let adminToken = localStorage.getItem("aulapulso-admin-token") || "";
const $ = (id) => document.getElementById(id);

async function api(path, payload) {
  const response = await fetch(path, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function adminLogin(password) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error("Contraseña incorrecta");
  const result = await response.json();
  adminToken = result.token;
  localStorage.setItem("aulapulso-admin-token", adminToken);
}

async function refreshContent() {
  examData = await api("/api/admin/content");
  $("adminOrganization").textContent = examData.organization || "Dirección General de Atención a la Salud";
  $("adminPlatform").textContent = examData.platformName || "AulaPulso Evalua";
  $("adminCourse").textContent = examData.course || "Curso Introductorio de Ultrasonido";
  $("coursePlatform").value = examData.platformName || "";
  $("courseOrganization").value = examData.organization || "";
  $("courseSubtitleInput").value = examData.subtitle || "";
  $("courseNameInput").value = examData.course || "";
  $("courseExamTitle").value = examData.examTitle || "";
  renderQuestionEditor();
  renderParticipantEditor();
}

function statusFor(row) {
  if (row.submittedAt) return "Finalizado";
  if (row.startedAt) return "Activo";
  return "Sin iniciar";
}

function filteredRows() {
  if (!latestState) return [];
  const query = $("adminSearch").value.trim().toLowerCase();
  const filter = $("adminFilter").value;
  return latestState.rows.filter((row) => {
    const status = statusFor(row);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && status === "Activo") ||
      (filter === "finished" && status === "Finalizado") ||
      (filter === "pending" && status === "Sin iniciar");
    const haystack = `${row.folio} ${row.name} ${row.site} ${row.career} ${row.userNumber}`.toLowerCase();
    return matchesFilter && haystack.includes(query);
  });
}

function lastAnswer(row) {
  const examIds = Object.keys(row.answers || {});
  const surveyIds = Object.keys(row.survey || {});
  if (surveyIds.length) {
    const id = surveyIds[surveyIds.length - 1];
    return `${id}: ${row.survey[id]}`;
  }
  if (examIds.length) {
    const id = examIds[examIds.length - 1];
    return `R${id}: ${row.answers[id]}`;
  }
  return "Sin respuesta";
}

function renderMonitor() {
  if (!latestState) return;
  const rows = filteredRows();
  const active = latestState.rows.filter((row) => row.startedAt && !row.submittedAt).length;
  const finishedRows = latestState.rows.filter((row) => row.submittedAt);
  const surveyComplete = latestState.rows.filter((row) => row.surveyAnswered === latestState.surveyQuestions).length;
  const average = finishedRows.length
    ? Math.round(finishedRows.reduce((sum, row) => sum + (row.score?.percent || 0), 0) / finishedRows.length)
    : 0;

  $("adminActive").textContent = active;
  $("adminFinished").textContent = finishedRows.length;
  $("adminAverage").textContent = `${average}%`;
  $("adminSurvey").textContent = surveyComplete;
  $("adminUpdated").textContent = `Actualizado: ${new Date(latestState.generatedAt).toLocaleTimeString("es-MX")}`;

  $("adminRows").innerHTML = rows
    .map((row) => {
      const status = statusFor(row);
      const score = row.score ? `${row.score.correct}/${row.score.total} (${row.score.percent}%)` : "-";
      return `
        <tr>
          <td><strong>${row.userNumber || row.folio}</strong><span>${row.folio}</span></td>
          <td><strong>${row.name}</strong><span>${row.site} · ${row.career}</span><span>${row.email || "Sin correo"}</span></td>
          <td><span class="status ${status === "Finalizado" ? "done" : status === "Activo" ? "live" : ""}">${status}</span></td>
          <td>
            <div class="mini-progress"><div style="width:${row.progress}%"></div></div>
            <span>${row.answered}/${latestState.examQuestions} reactivos · ${row.surveyAnswered}/${latestState.surveyQuestions} encuesta</span>
          </td>
          <td>${score}</td>
          <td>${lastAnswer(row)}</td>
          <td>${Object.entries(row.survey || {}).map(([id, value]) => `${id}:${value}`).join(" · ") || row.emailStatus || "-"}</td>
        </tr>
      `;
    })
    .join("");

  renderSurveySummary();
}

function renderSurveySummary() {
  if (!latestState) return;
  const rows = latestState.rows.filter((row) => row.survey);
  $("surveySummary").innerHTML = Object.entries(surveyLabels)
    .map(([id, label]) => {
      const counts = { A: 0, B: 0, C: 0, D: 0 };
      for (const row of rows) {
        const answer = row.survey?.[id];
        if (counts[answer] !== undefined) counts[answer] += 1;
      }
      return `
        <article class="survey-card">
          <h3>${id}. ${label}</h3>
          <div class="survey-bars">
            ${Object.entries(counts)
              .map(([key, value]) => {
                const max = Math.max(1, ...Object.values(counts));
                return `<div><span>${key}</span><div class="mini-progress"><div style="width:${Math.round((value / max) * 100)}%"></div></div><strong>${value}</strong></div>`;
              })
              .join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderQuestionEditor() {
  $("questionCountAdmin").textContent = `${examData.questions.length} reactivos`;
  $("questionList").innerHTML = examData.questions
    .map(
      (question) => `
      <article class="editor-item">
        <div>
          <strong>Reactivo ${question.id}</strong>
          <p>${question.prompt}</p>
          <span>Correcta: ${question.correct} · Imagenes: ${(question.images || []).length} · ${question.annotation || "Sin anotaciones"}</span>
        </div>
        <div class="item-actions">
          <button class="secondary" type="button" data-edit-question="${question.id}">Editar</button>
          <button class="ghost danger" type="button" data-delete-question="${question.id}">Eliminar</button>
        </div>
      </article>
    `
    )
    .join("");
}

function renderParticipantEditor() {
  $("participantCountAdmin").textContent = `${examData.participants.length} participantes`;
  $("participantAdminList").innerHTML = examData.participants
    .map(
      (person) => `
      <article class="editor-item">
        <div>
          <strong>${person.name}</strong>
          <p>${person.site} · ${person.career} · ${person.folio}</p>
          <span>Usuario: ${person.userNumber} · Contraseña: ${person.password}</span>
        </div>
        <div class="item-actions">
          <button class="secondary" type="button" data-edit-participant="${person.id}">Editar</button>
          <button class="ghost danger" type="button" data-delete-participant="${person.id}">Eliminar</button>
        </div>
      </article>
    `
    )
    .join("");
}

function readImage(file) {
  return new Promise((resolve) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({ imageName: file.name, imageData: reader.result });
    reader.readAsDataURL(file);
  });
}

function exportCsv() {
  if (!latestState) return;
  const rows = [
    [
      "usuario",
      "password",
      "folio",
      "nombre",
      "sede",
      "carrera",
      "estado",
      "correo",
      "estado_correo",
      "reactivos_respondidos",
      "encuesta_respondida",
      "aciertos",
      "porcentaje",
      ...examData.questions.map((question) => `R${question.id}`),
      ...Object.keys(surveyLabels),
    ],
  ];
  for (const row of latestState.rows) {
    rows.push([
      row.userNumber || "",
      row.password || "",
      row.folio,
      row.name,
      row.site,
      row.career,
      statusFor(row),
      row.email || "",
      row.emailStatus || "",
      row.answered,
      row.surveyAnswered,
      row.score?.correct ?? "",
      row.score?.percent ?? "",
      ...examData.questions.map((question) => row.answers?.[question.id] || ""),
      ...Object.keys(surveyLabels).map((id) => row.survey?.[id] || ""),
    ]);
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "admin-respuestas-y-credenciales.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function loadInitialState() {
  await refreshContent();
  latestState = await api("/api/admin/state");
  renderMonitor();
}

function connectLive() {
  const events = new EventSource(`/api/admin/events?token=${encodeURIComponent(adminToken)}`);
  events.onmessage = (event) => {
    latestState = JSON.parse(event.data);
    renderMonitor();
  };
  events.onerror = () => {
    $("adminUpdated").textContent = "Reconectando...";
  };
}

document.querySelectorAll(".admin-mode").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-mode").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".admin-section").forEach((item) => item.classList.add("hidden"));
    button.classList.add("active");
    $(button.dataset.view).classList.remove("hidden");
  });
});

$("courseForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  examData = await api("/api/admin/content", {
    platformName: $("coursePlatform").value,
    organization: $("courseOrganization").value,
    subtitle: $("courseSubtitleInput").value,
    course: $("courseNameInput").value,
    examTitle: $("courseExamTitle").value,
  });
  await refreshContent();
});

$("questionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const image = await readImage($("questionImage").files[0]);
  examData = await api("/api/admin/question", {
    id: $("questionId").value,
    prompt: $("questionPromptInput").value,
    options: {
      A: $("optionA").value,
      B: $("optionB").value,
      C: $("optionC").value,
      D: $("optionD").value,
    },
    correct: $("correctOption").value,
    feedback: $("questionFeedback").value,
    annotation: $("questionAnnotation").value,
    ...(image || {}),
  });
  $("questionForm").reset();
  await refreshContent();
});

$("participantForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  examData = await api("/api/admin/participant", {
    id: $("participantIdInput").value,
    name: $("participantNameInput").value,
    site: $("participantSiteInput").value,
    career: $("participantCareerInput").value,
    folio: $("participantFolioInput").value,
    userNumber: $("participantUserInput").value,
    password: $("participantPasswordInput").value,
  });
  $("participantForm").reset();
  await refreshContent();
});

document.addEventListener("click", async (event) => {
  const questionId = event.target.dataset.editQuestion;
  const deleteQuestion = event.target.dataset.deleteQuestion;
  const participantId = event.target.dataset.editParticipant;
  const deleteParticipant = event.target.dataset.deleteParticipant;

  if (questionId) {
    const question = examData.questions.find((item) => Number(item.id) === Number(questionId));
    $("questionId").value = question.id;
    $("questionPromptInput").value = question.prompt;
    $("optionA").value = question.options.find((item) => item.key === "A")?.text || "";
    $("optionB").value = question.options.find((item) => item.key === "B")?.text || "";
    $("optionC").value = question.options.find((item) => item.key === "C")?.text || "";
    $("optionD").value = question.options.find((item) => item.key === "D")?.text || "";
    $("correctOption").value = question.correct;
    $("questionFeedback").value = question.feedback || "";
    $("questionAnnotation").value = question.annotation || "";
  }

  if (deleteQuestion) {
    examData = await api("/api/admin/delete-question", { id: deleteQuestion });
    await refreshContent();
  }

  if (participantId) {
    const person = examData.participants.find((item) => item.id === participantId);
    $("participantIdInput").value = person.id;
    $("participantNameInput").value = person.name;
    $("participantSiteInput").value = person.site;
    $("participantCareerInput").value = person.career;
    $("participantFolioInput").value = person.folio;
    $("participantUserInput").value = person.userNumber;
    $("participantPasswordInput").value = person.password;
  }

  if (deleteParticipant) {
    examData = await api("/api/admin/delete-participant", { id: deleteParticipant });
    await refreshContent();
  }
});

$("adminSearch").addEventListener("input", renderMonitor);
$("adminFilter").addEventListener("change", renderMonitor);
$("adminExport").addEventListener("click", exportCsv);

$("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await adminLogin($("adminPasswordInput").value);
    $("adminLoginView").classList.add("hidden");
    $("adminApp").classList.remove("hidden");
    await loadInitialState();
    connectLive();
  } catch {
    $("adminLoginMessage").textContent = "Contraseña de administrador incorrecta.";
  }
});

if (adminToken) {
  $("adminLoginView").classList.add("hidden");
  $("adminApp").classList.remove("hidden");
  loadInitialState()
    .then(connectLive)
    .catch(() => {
      localStorage.removeItem("aulapulso-admin-token");
      adminToken = "";
      $("adminApp").classList.add("hidden");
      $("adminLoginView").classList.remove("hidden");
      $("adminLoginMessage").textContent = "La sesión de administrador expiró.";
    });
}
