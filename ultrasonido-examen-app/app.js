let data = window.EXAM_DATA;
const storageKey = "unam-ultrasonido-examen-v3";
const questionSeconds = 180;
const surveyQuestions = [
  {
    id: "S1",
    prompt: "En general, ¿el curso introductorio de ultrasonido fue de tu agrado?",
    options: [
      { key: "A", text: "Sí, mucho." },
      { key: "B", text: "Sí, en general." },
      { key: "C", text: "Regular." },
      { key: "D", text: "No fue de mi agrado." },
    ],
  },
  {
    id: "S2",
    prompt: "¿Consideras que el curso fue útil para tu práctica clínica o comunitaria?",
    options: [
      { key: "A", text: "Muy útil." },
      { key: "B", text: "Útil." },
      { key: "C", text: "Poco útil." },
      { key: "D", text: "No útil." },
    ],
  },
  {
    id: "S3",
    prompt: "¿Te gustaría que se realizara un curso más amplio de ultrasonido?",
    options: [
      { key: "A", text: "Sí, definitivamente." },
      { key: "B", text: "Sí, probablemente." },
      { key: "C", text: "No estoy seguro/a." },
      { key: "D", text: "No lo considero necesario." },
    ],
  },
  {
    id: "S4",
    prompt: "¿Qué duración te parecería adecuada para un curso más grande?",
    options: [
      { key: "A", text: "Un día completo." },
      { key: "B", text: "Dos a tres días." },
      { key: "C", text: "Una semana." },
      { key: "D", text: "Varias sesiones durante un mes." },
    ],
  },
  {
    id: "S5",
    prompt: "¿Recomendarías este curso a otro personal de salud?",
    options: [
      { key: "A", text: "Sí, sin duda." },
      { key: "B", text: "Sí." },
      { key: "C", text: "Tal vez." },
      { key: "D", text: "No." },
    ],
  },
];

let state = loadState();
let currentParticipant = null;
let currentPassword = "";
let currentIndex = 0;
let currentMode = "exam";
let timerHandle = null;
let onlineMode = location.protocol.startsWith("http");

const $ = (id) => document.getElementById(id);
const views = {
  login: $("loginView"),
  exam: $("examView"),
  result: $("resultView"),
  final: $("finalView"),
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || { attempts: {} };
  } catch {
    return { attempts: {} };
  }
}

function saveLocalState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

async function api(path, payload) {
  if (!onlineMode) return null;
  try {
    const response = await fetch(path, {
      method: payload ? "POST" : "GET",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (response.status === 401) return { error: "No autorizado" };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    onlineMode = false;
    console.warn("Modo local activado; no se pudo conectar con el servidor.", error);
    return null;
  }
}

async function loadContent() {
  const content = await api("/api/content");
  if (content?.participants && content?.questions) data = content;
  document.title = `${data.platformName || "AulaPulso Evalua"} | DGAS UNAM`;
  $("organizationName").textContent = data.organization || "Dirección General de Atención a la Salud";
  $("platformName").textContent = data.platformName || "AulaPulso Evalua";
  $("courseSubtitle").textContent = data.subtitle || "Plataforma de evaluación y mejora continua de cursos";
  $("courseName").textContent = data.course || "Curso Introductorio de Ultrasonido";
}

function showView(name) {
  clearInterval(timerHandle);
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function attemptFor(id) {
  if (!state.attempts[id]) {
    state.attempts[id] = {
      participantId: id,
      answers: {},
      survey: {},
      startedAt: new Date().toISOString(),
      submittedAt: null,
      surveySubmittedAt: null,
      score: null,
      examQuestionIds: [],
    };
  }
  if (!state.attempts[id].answers) state.attempts[id].answers = {};
  if (!state.attempts[id].survey) state.attempts[id].survey = {};
  if (!state.attempts[id].examQuestionIds) state.attempts[id].examQuestionIds = [];
  return state.attempts[id];
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function selectedExamQuestions() {
  const attempt = attemptFor(currentParticipant.id);
  const ids = attempt.examQuestionIds?.length ? attempt.examQuestionIds.map(Number) : data.questions.slice(0, 15).map((question) => Number(question.id));
  return ids.map((id) => data.questions.find((question) => Number(question.id) === Number(id))).filter(Boolean);
}

function activeQuestions() {
  return currentMode === "survey" ? surveyQuestions.map((question) => ({ ...question, survey: true, images: [] })) : selectedExamQuestions();
}

function answerBucket(attempt, question) {
  return question.survey ? attempt.survey : attempt.answers;
}

function filterParticipants() {
  const query = $("participantSearch").value.trim().toLowerCase();
  const matches = data.participants.filter((person) => {
    const haystack = `${person.name} ${person.site} ${person.career} ${person.folio} ${person.userNumber}`.toLowerCase();
    return haystack.includes(query);
  });
  renderOfficialList(matches);
}

function renderOfficialList(matches = data.participants) {
  $("officialListCount").textContent = `${matches.length} participantes`;
  $("officialList").innerHTML = matches
    .map(
      (person) => `
        <article class="participant-chip">
          <strong>${person.name}</strong>
          <span>${person.site} · ${person.career}</span>
          <span>${person.folio}</span>
          <span class="credential-pill">Usuario ${person.userNumber}</span>
        </article>
      `
    )
    .join("");
}

function updateParticipantPreview(person, message = "") {
  if (!person) {
    $("participantPreview").innerHTML = "Ingresa tu número de usuario y contraseña para iniciar.";
    return;
  }
  const attempt = state.attempts[person.id];
  $("participantPreview").innerHTML = `
    <strong>${person.name}</strong>
    <span>${person.site} · ${person.career} · Folio ${person.folio} · Usuario ${person.userNumber}</span>
    <span>${attempt?.submittedAt ? "La evaluación ya fue finalizada. No puede repetirse." : "Disponible para iniciar."}</span>
    ${message ? `<span>${message}</span>` : ""}
  `;
}

async function bootLogin() {
  await loadContent();
  $("participantCount").textContent = data.participants.length;
  $("questionCount").textContent = "15 + 5";
  filterParticipants();
  updateParticipantPreview(
    null,
    onlineMode ? "" : "Esta versión debe abrirse desde el servidor para validar contraseñas. Usa http://localhost:8765/."
  );
  showView("login");
}

async function handleLogin() {
  const userNumber = $("userNumberInput").value.trim().toUpperCase();
  const password = $("passwordInput").value.trim();
  if (onlineMode) {
    const result = await api("/api/login", { userNumber, password });
    if (!result?.participant) {
      updateParticipantPreview(null, "Usuario o contraseña incorrectos.");
      return;
    }
    currentPassword = password;
    currentParticipant = result.participant;
    if (!data.participants.find((person) => person.id === result.participant.id)) data.participants.push(result.participant);
    if (result.state?.attempts) state = { attempts: { ...state.attempts, ...result.state.attempts } };
    saveLocalState();
    updateParticipantPreview(result.participant);
    startExam(result.participant.id);
    return;
  }

  const person = data.participants.find((item) => String(item.userNumber).toUpperCase() === userNumber && String(item.password) === password);
  if (!person) {
    const hasLocalPasswords = data.participants.some((item) => item.password);
    updateParticipantPreview(
      null,
      hasLocalPasswords
        ? "Usuario o contraseña incorrectos."
        : "No se puede validar la contraseña abriendo el archivo directamente. Inicia el servidor y entra a http://localhost:8765/."
    );
    return;
  }
  currentPassword = password;
  currentParticipant = person;
  updateParticipantPreview(person);
  startExam(person.id);
}

async function startExam(personId) {
  currentParticipant = data.participants.find((person) => person.id === personId) || currentParticipant;
  currentIndex = 0;
  currentMode = "exam";

  const remote = await api("/api/start", { participantId: personId, password: currentPassword });
  if (remote?.attempts) state = { attempts: { ...state.attempts, ...remote.attempts } };
  saveLocalState();

  const attempt = attemptFor(personId);
  if (attempt.submittedAt) {
    renderResult();
    return;
  }

  $("studentInitials").textContent = initials(currentParticipant.name);
  $("studentName").textContent = currentParticipant.name;
  $("studentMeta").textContent = `${currentParticipant.site} · ${currentParticipant.career}`;
  $("studentFolio").textContent = currentParticipant.folio;
  buildQuestionNav();
  renderQuestion();
  showView("exam");
}

function startSurvey() {
  currentMode = "survey";
  currentIndex = 0;
  $("studentInitials").textContent = initials(currentParticipant.name);
  $("studentName").textContent = currentParticipant.name;
  $("studentMeta").textContent = `${currentParticipant.site} · ${currentParticipant.career}`;
  $("studentFolio").textContent = currentParticipant.folio;
  buildQuestionNav();
  renderQuestion();
  showView("exam");
}

function buildQuestionNav() {
  const questions = activeQuestions();
  $("questionNav").innerHTML = questions
    .map((question, index) => {
      const label = question.survey ? question.id : index + 1;
      const title = question.survey ? `Percepción ${question.id}` : `Reactivo ${index + 1}`;
      return `<button class="nav-dot ${question.survey ? "survey-dot" : ""}" type="button" data-index="${index}" title="${title}">${label}</button>`;
    })
    .join("");
  document.querySelectorAll(".nav-dot").forEach((button) => {
    button.addEventListener("click", () => {
      if (currentMode === "exam") return;
      currentIndex = Number(button.dataset.index);
      renderQuestion();
    });
  });
}

function renderQuestion() {
  clearInterval(timerHandle);
  const questions = activeQuestions();
  const question = questions[currentIndex];
  const attempt = attemptFor(currentParticipant.id);
  const answers = answerBucket(attempt, question);
  const selected = answers[question.id];

  $("questionBadge").textContent = question.survey ? `Percepción del curso · ${question.id}` : `Reactivo ${currentIndex + 1} de ${questions.length}`;
  $("questionPrompt").textContent = question.prompt;
  $("questionImages").innerHTML = (question.images || [])
    .map((src, index) => `<img src="${src}" alt="Imagen del reactivo ${currentIndex + 1}.${index + 1}" />`)
    .join("");
  $("options").innerHTML = question.options
    .map(
      (option) => `
      <label class="option ${selected === option.key ? "selected locked" : ""} ${currentMode === "exam" && selected ? "locked" : ""}">
        <span class="option-key">${option.key}</span>
        <input type="radio" name="answer" value="${option.key}" ${selected === option.key ? "checked" : ""} hidden />
        <span>${option.text}</span>
      </label>`
    )
    .join("");

  document.querySelectorAll(".option").forEach((option) => {
    option.addEventListener("click", async () => {
      if (currentMode === "exam" && selected) return;
      const value = option.querySelector("input").value;
      answers[question.id] = value;
      await sendAnswer(question, value);
      saveLocalState();
      if (currentMode === "exam") {
        clearInterval(timerHandle);
        $("questionTimer").textContent = "Respuesta registrada. Avanzando...";
        $("questionTimerInline").textContent = "Respuesta registrada";
        setTimeout(goNext, 450);
      } else {
        renderQuestion();
      }
    });
  });

  $("prevButton").disabled = currentIndex === 0 || currentMode === "exam";
  $("nextButton").textContent =
    currentMode === "survey" && currentIndex === questions.length - 1 ? "Terminar evaluación" : currentIndex === questions.length - 1 ? "Finalizar examen" : "Siguiente";
  $("nextButton").disabled = currentMode === "survey" && !selected;
  updateProgress();
  if (currentMode === "exam" && !selected) startQuestionTimer(question);
  else {
    const text = currentMode === "exam" ? "Reactivo contestado" : "Encuesta sin temporizador";
    $("questionTimer").textContent = text;
    $("questionTimerInline").textContent = text;
  }
}

async function sendAnswer(question, value) {
  if (!onlineMode) return;
  const remote = await api("/api/answer", {
    participantId: currentParticipant.id,
    password: currentPassword,
    questionId: question.id,
    answer: value,
    kind: question.survey ? "survey" : "exam",
  });
  if (remote?.attempts) state = { attempts: { ...state.attempts, ...remote.attempts } };
}

function startQuestionTimer(question) {
  const timerKey = `${currentParticipant.id}-${question.id}`;
  let end = Number(sessionStorage.getItem(timerKey));
  if (!end || end < Date.now()) {
    end = Date.now() + questionSeconds * 1000;
    sessionStorage.setItem(timerKey, String(end));
  }
  const tick = async () => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    const min = String(Math.floor(remaining / 60)).padStart(2, "0");
    const sec = String(remaining % 60).padStart(2, "0");
    const text = `Tiempo restante: ${min}:${sec}`;
    $("questionTimer").textContent = text;
    $("questionTimerInline").textContent = text;
    if (!remaining) {
      clearInterval(timerHandle);
      const attempt = attemptFor(currentParticipant.id);
      if (!attempt.answers[question.id]) {
        attempt.answers[question.id] = "__TIMEOUT__";
        await sendAnswer(question, "__TIMEOUT__");
        saveLocalState();
      }
      goNext();
    }
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}

function updateProgress() {
  const attempt = attemptFor(currentParticipant.id);
  const questions = activeQuestions();
  const answered = questions.filter((question) => answerBucket(attempt, question)[question.id]).length;
  const percent = Math.round((answered / questions.length) * 100);
  $("progressText").textContent = `${answered}/${questions.length}`;
  $("progressBar").style.width = `${percent}%`;

  document.querySelectorAll(".nav-dot").forEach((button, index) => {
    const question = questions[index];
    button.classList.toggle("current", index === currentIndex);
    button.classList.toggle("answered", Boolean(answerBucket(attempt, question)[question.id]));
  });

  $("finishButton").classList.toggle("hidden", currentMode === "survey");
  $("finishButton").textContent = "Finalizar examen";
  $("finishButton").disabled = currentMode !== "exam" || answered < questions.length;
}

async function gradeOfficialAttempt() {
  const remote = await api("/api/submit", { participantId: currentParticipant.id, password: currentPassword });
  if (remote?.attempts) state = { attempts: { ...state.attempts, ...remote.attempts } };
  const attempt = attemptFor(currentParticipant.id);
  if (!attempt.score) {
    const questions = selectedExamQuestions();
    const correct = questions.filter((question) => attempt.answers[question.id] === question.correct).length;
    attempt.submittedAt = new Date().toISOString();
    attempt.score = { correct, total: questions.length, percent: Math.round((correct / questions.length) * 100) };
  }
  saveLocalState();
  renderResult();
}

function renderResult() {
  const attempt = attemptFor(currentParticipant.id);
  const score = attempt.score || { correct: 0, total: selectedExamQuestions().length, percent: 0 };
  const passed = score.percent >= 80;
  const questions = selectedExamQuestions();

  $("resultStatus").textContent = "Terminó la evaluación";
  $("resultStatus").style.background = passed ? "var(--mint)" : "var(--coral)";
  $("resultTitle").textContent = `${currentParticipant.name}`;
  $("resultMeta").textContent = `${currentParticipant.folio} · Calificación: ${score.correct}/${score.total}`;
  $("scorePercent").textContent = `${score.correct}/${score.total}`;
  $("scoreRaw").textContent = "Calificación";
  $("reviewTimer").textContent = "La evaluación fue registrada. No podrás repetir el examen. Revisa tu retroalimentación y después responde la percepción del curso.";

  $("reviewList").innerHTML = questions
    .map((question, index) => {
      const picked = attempt.answers[question.id] || "Sin respuesta";
      const timedOut = picked === "__TIMEOUT__";
      const ok = picked === question.correct;
      const chosenText = timedOut ? "Sin respuesta por tiempo agotado" : question.options.find((option) => option.key === picked)?.text || "Sin respuesta";
      const correctText = question.options.find((option) => option.key === question.correct)?.text || "";
      return `
        <article class="review-item ${ok ? "" : "wrong"}">
          <h3>Reactivo ${index + 1}: ${ok ? "Correcto" : "Revisar"}</h3>
          <p><strong>Respuesta elegida:</strong> ${timedOut ? "" : `${picked}) `}${chosenText}</p>
          <p><strong>Respuesta correcta:</strong> ${question.correct}) ${correctText}</p>
          <p><strong>Retroalimentación:</strong> ${question.feedback}</p>
        </article>
      `;
    })
    .join("");

  $("practiceButton").textContent = "Responder percepción del curso";
  $("practiceButton").disabled = false;
  showView("result");
}

async function finishSurvey() {
  const attempt = attemptFor(currentParticipant.id);
  attempt.surveySubmittedAt = new Date().toISOString();
  saveLocalState();
  $("finalMeta").textContent = `${currentParticipant.name} · ${currentParticipant.folio}. Tus respuestas fueron registradas.`;
  showView("final");
}

function goNext() {
  const questions = activeQuestions();
  if (currentIndex < questions.length - 1) {
    currentIndex += 1;
    renderQuestion();
    return;
  }
  if (currentMode === "exam") gradeOfficialAttempt();
  else finishSurvey();
}

function exportCsv() {
  const rows = [["folio", "nombre", "sede", "carrera", "fecha_inicio", "fecha_fin", "aciertos", "total", "porcentaje", ...surveyQuestions.map((question) => question.id)]];
  for (const person of data.participants) {
    const attempt = state.attempts[person.id];
    if (!attempt?.submittedAt) continue;
    rows.push([
      person.folio,
      person.name,
      person.site,
      person.career,
      attempt.startedAt,
      attempt.submittedAt,
      attempt.score.correct,
      attempt.score.total,
      attempt.score.percent,
      ...surveyQuestions.map((question) => attempt.survey?.[question.id] || ""),
    ]);
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "resultados-examen-ultrasonido.csv";
  link.click();
  URL.revokeObjectURL(url);
}

$("participantSearch").addEventListener("input", filterParticipants);
$("loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  handleLogin();
});
$("prevButton").addEventListener("click", () => {
  currentIndex = Math.max(0, currentIndex - 1);
  renderQuestion();
});
$("nextButton").addEventListener("click", goNext);
$("finishButton").addEventListener("click", gradeOfficialAttempt);
$("logoutButton").addEventListener("click", bootLogin);
$("backToLoginButton").addEventListener("click", bootLogin);
$("exportButton").addEventListener("click", exportCsv);
$("practiceButton").addEventListener("click", startSurvey);
$("finalExitButton").addEventListener("click", bootLogin);

bootLogin();
