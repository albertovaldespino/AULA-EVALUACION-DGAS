let data = window.EXAM_DATA;
const storageKey = "unam-aulapulso-examen-banco-completo-v4";
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
let currentEmail = "";
let currentCourseId = "ultrasonido";
let currentEvaluationId = "ultrasonido-final";
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

function courses() {
  return data.courses?.length
    ? data.courses
    : [
        {
          id: "ultrasonido",
          title: data.course || "Curso Introductorio de Ultrasonido",
          evaluations: [
            {
              id: "ultrasonido-final",
              title: data.course || "Curso Introductorio de Ultrasonido",
              questionCount: (data.questions || []).length,
              includeSurvey: true,
              questions: data.questions || [],
              participants: data.participants || [],
            },
          ],
        },
      ];
}

function currentCourse() {
  return courses().find((course) => course.id === currentCourseId) || courses()[0];
}

function currentEvaluation() {
  const course = currentCourse();
  return course.evaluations.find((evaluation) => evaluation.id === currentEvaluationId) || course.evaluations[0];
}

function currentParticipants() {
  return currentEvaluation().participants || data.participants || [];
}

function currentQuestions() {
  return currentEvaluation().questions || data.questions || [];
}

function currentAttemptKey(participantId = currentParticipant?.id) {
  return `${currentEvaluation().id}::${participantId}`;
}

function renderCourseSelectors() {
  const availableCourses = courses();
  if (!availableCourses.find((course) => course.id === currentCourseId)) currentCourseId = availableCourses[0]?.id || "ultrasonido";
  const course = currentCourse();
  if (!course.evaluations.find((evaluation) => evaluation.id === currentEvaluationId)) currentEvaluationId = course.evaluations[0]?.id || "ultrasonido-final";
  const evaluation = currentEvaluation();

  $("courseSelect").innerHTML = availableCourses.map((item) => `<option value="${item.id}">${item.title}</option>`).join("");
  $("courseSelect").value = currentCourseId;
  $("evaluationSelect").innerHTML = (course.evaluations || []).map((item) => `<option value="${item.id}">${item.title}</option>`).join("");
  $("evaluationSelect").value = currentEvaluationId;

  $("courseName").textContent = evaluation.title || course.title || data.course || "Evaluación";
  $("participantCount").textContent = currentParticipants().length;
  const questionTotal = currentQuestions().length || evaluation.questionCount || 0;
  $("questionCount").textContent = evaluation.includeSurvey === false ? `${questionTotal} reactivos` : `${questionTotal} + 5`;
  $("participantSearch").value = "";
  filterParticipants();
}

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
  renderCourseSelectors();
}

function showView(name) {
  clearInterval(timerHandle);
  Object.values(views).forEach((view) => view.classList.add("hidden"));
  views[name].classList.remove("hidden");
}

function attemptFor(id) {
  const key = currentAttemptKey(id);
  if (!state.attempts[key]) {
    state.attempts[key] = {
      participantId: id,
      evaluationId: currentEvaluation().id,
      answers: {},
      survey: {},
      startedAt: new Date().toISOString(),
      submittedAt: null,
      surveySubmittedAt: null,
      score: null,
      email: "",
      examQuestionIds: [],
    };
  }
  if (!state.attempts[key].answers) state.attempts[key].answers = {};
  if (!state.attempts[key].survey) state.attempts[key].survey = {};
  if (!state.attempts[key].examQuestionIds) state.attempts[key].examQuestionIds = [];
  return state.attempts[key];
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
  const questionBank = currentQuestions();
  const limit = questionBank.length || currentEvaluation().questionCount || 0;
  const ids = attempt.examQuestionIds?.length ? attempt.examQuestionIds.map(Number) : questionBank.slice(0, limit).map((question) => Number(question.id));
  return ids.map((id) => questionBank.find((question) => Number(question.id) === Number(id))).filter(Boolean);
}

function activeQuestions() {
  return currentMode === "survey" ? surveyQuestions.map((question) => ({ ...question, survey: true, images: [] })) : selectedExamQuestions();
}

function answerBucket(attempt, question) {
  return question.survey ? attempt.survey : attempt.answers;
}

function filterParticipants() {
  const query = $("participantSearch").value.trim().toLowerCase();
  const matches = currentParticipants().filter((person) => {
    const haystack = `${person.name} ${person.site} ${person.career} ${person.folio} ${person.userNumber}`.toLowerCase();
    return haystack.includes(query);
  });
  renderOfficialList(matches);
}

function renderOfficialList(matches = currentParticipants()) {
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
  const attempt = state.attempts[currentAttemptKey(person.id)];
  $("participantPreview").innerHTML = `
    <strong>${person.name}</strong>
    <span>${person.site} · ${person.career} · Folio ${person.folio} · Usuario ${person.userNumber}</span>
    <span>${attempt?.submittedAt ? "La evaluación ya fue finalizada. No puede repetirse." : "Disponible para iniciar."}</span>
    ${message ? `<span>${message}</span>` : ""}
  `;
}

async function bootLogin() {
  await loadContent();
  updateParticipantPreview(
    null,
    onlineMode ? "" : "Esta versión debe abrirse desde la URL publicada del servidor para validar contraseñas."
  );
  showView("login");
}

async function handleLogin() {
  const userNumber = $("userNumberInput").value.trim().toUpperCase();
  const password = $("passwordInput").value.trim();
  const email = $("emailInput").value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    updateParticipantPreview(null, "Agrega un correo electrónico válido para recibir tu resultado.");
    return;
  }
  currentEmail = email;
  if (onlineMode) {
    const result = await api("/api/login", { userNumber, password, email, evaluationId: currentEvaluation().id });
    if (!result?.participant) {
      updateParticipantPreview(null, "Usuario o contraseña incorrectos.");
      return;
    }
    currentPassword = password;
    currentParticipant = result.participant;
    if (!currentParticipants().find((person) => person.id === result.participant.id)) currentParticipants().push(result.participant);
    if (result.state?.attempts) state = { attempts: { ...state.attempts, ...result.state.attempts } };
    saveLocalState();
    updateParticipantPreview(result.participant);
    startExam(result.participant.id);
    return;
  }

  const person = currentParticipants().find((item) => String(item.userNumber).toUpperCase() === userNumber && String(item.password) === password);
  if (!person) {
    const hasLocalPasswords = currentParticipants().some((item) => item.password);
    updateParticipantPreview(
      null,
      hasLocalPasswords
        ? "Usuario o contraseña incorrectos."
        : "No se puede validar la contraseña abriendo el archivo directamente. Entra desde la URL publicada del servidor."
    );
    return;
  }
  currentPassword = password;
  currentParticipant = person;
  updateParticipantPreview(person);
  startExam(person.id);
}

async function startExam(personId) {
  currentParticipant = currentParticipants().find((person) => person.id === personId) || currentParticipant;
  currentIndex = 0;
  currentMode = "exam";

  const remote = await api("/api/start", { participantId: personId, password: currentPassword, email: currentEmail, evaluationId: currentEvaluation().id });
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
        $("questionTimer").textContent = "Respuesta registrada. Avanzando...";
        $("questionTimerInline").textContent = "Respuesta registrada";
        setTimeout(goNext, 250);
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
    evaluationId: currentEvaluation().id,
  });
  if (remote?.attempts) state = { attempts: { ...state.attempts, ...remote.attempts } };
}

function startQuestionTimer(question) {
  const timerKey = `${currentEvaluation().id}-${currentParticipant.id}-${question.id}`;
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
  const remote = await api("/api/submit", { participantId: currentParticipant.id, password: currentPassword, email: currentEmail, evaluationId: currentEvaluation().id });
  if (remote?.attempts) state = { attempts: { ...state.attempts, ...remote.attempts } };
  const attempt = attemptFor(currentParticipant.id);
  if (!attempt.score) {
    const questions = selectedExamQuestions();
    const correct = questions.filter((question) => attempt.answers[question.id] === question.correct).length;
    attempt.submittedAt = new Date().toISOString();
    attempt.score = { correct, total: questions.length, percent: Math.round((correct / questions.length) * 100), grade10: Number(((correct / questions.length) * 10).toFixed(1)) };
  }
  saveLocalState();
  renderResult();
}

function renderResult() {
  const attempt = attemptFor(currentParticipant.id);
  const score = attempt.score || { correct: 0, total: selectedExamQuestions().length, percent: 0 };
  if (score.grade10 === undefined) score.grade10 = Number(((score.correct / Math.max(1, score.total)) * 10).toFixed(1));
  const passed = score.grade10 >= 8;
  const questions = selectedExamQuestions();
  const requiresSurvey = currentEvaluation().includeSurvey !== false;

  $("resultStatus").textContent = "Terminó la evaluación";
  $("resultStatus").style.background = passed ? "var(--mint)" : "var(--coral)";
  $("resultTitle").textContent = `${currentParticipant.name}`;
  $("resultMeta").textContent = `${currentParticipant.folio} · Calificación: ${score.grade10}/10 · Aciertos: ${score.correct}/${score.total}`;
  $("scorePercent").textContent = `${score.grade10}/10`;
  $("scoreRaw").textContent = "Calificación";
  const emailStatus =
    attempt.emailStatus === "sent"
      ? `Resultado enviado a ${attempt.email || currentEmail}.`
      : attempt.emailStatus?.startsWith("error:")
        ? `No se pudo enviar el correo. El administrador debe revisar Render Logs.`
        : `El servidor está procesando el envío a ${attempt.email || currentEmail}.`;
  $("reviewTimer").textContent = `La evaluación fue registrada. No podrás repetir el examen. ${emailStatus} Revisa tu retroalimentación.${requiresSurvey ? " Después responde la percepción del curso." : " Sigue aprendiendo: cada pregunta contestada fortalece tu práctica y tu servicio a la comunidad."}`;

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

  $("practiceButton").textContent = requiresSurvey ? "Responder percepción del curso" : "Terminar evaluación";
  $("practiceButton").disabled = false;
  showView("result");
}

async function finishSurvey() {
  const attempt = attemptFor(currentParticipant.id);
  attempt.surveySubmittedAt = new Date().toISOString();
  saveLocalState();
  $("finalMeta").textContent = `${currentParticipant.name} · ${currentParticipant.folio}. Tus respuestas fueron registradas y tu resultado quedó asociado a ${currentEmail}.`;
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
  const rows = [["curso", "cuestionario", "folio", "nombre", "sede", "carrera", "fecha_inicio", "fecha_fin", "aciertos", "total", "calificacion_10", ...surveyQuestions.map((question) => question.id)]];
  for (const person of currentParticipants()) {
    const attempt = state.attempts[currentAttemptKey(person.id)];
    if (!attempt?.submittedAt) continue;
    rows.push([
      currentCourse().title,
      currentEvaluation().title,
      person.folio,
      person.name,
      person.site,
      person.career,
      attempt.startedAt,
      attempt.submittedAt,
      attempt.score.correct,
      attempt.score.total,
      attempt.score.grade10 ?? Number(((attempt.score.correct / Math.max(1, attempt.score.total)) * 10).toFixed(1)),
      ...surveyQuestions.map((question) => attempt.survey?.[question.id] || ""),
    ]);
  }
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resultados-${currentEvaluation().id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

$("participantSearch").addEventListener("input", filterParticipants);
$("courseSelect").addEventListener("change", () => {
  currentCourseId = $("courseSelect").value;
  currentEvaluationId = currentCourse().evaluations[0]?.id || currentEvaluationId;
  renderCourseSelectors();
  updateParticipantPreview(null);
});
$("evaluationSelect").addEventListener("change", () => {
  currentEvaluationId = $("evaluationSelect").value;
  renderCourseSelectors();
  updateParticipantPreview(null);
});
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
$("practiceButton").addEventListener("click", () => {
  if (currentEvaluation().includeSurvey === false) finishSurvey();
  else startSurvey();
});
$("finalExitButton").addEventListener("click", bootLogin);

bootLogin();
