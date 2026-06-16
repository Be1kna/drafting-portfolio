const projectsFile = 'projects.json';
const slideshowBaseFolder = 'Slideshows/';

const themeToggle = document.getElementById('themeToggle');
const slideshowModal = document.getElementById('slideshowModal');
const slideshowBackdrop = document.getElementById('slideshowBackdrop');
const slideshowClose = document.getElementById('slideshowClose');
const slideshowFrame = document.getElementById('slideshowFrame');
const slideshowContent = slideshowModal.querySelector('.modal-content');
const pdfViewer = document.getElementById('pdfViewer');
const pdfCanvas = document.getElementById('pdfCanvas');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageNumLabel = document.getElementById('pageNum');
const pdfControls = pdfViewer.querySelector('.pdf-controls');

const modalTypeClasses = ['slideshow-mode', 'pdf-mode'];
const pdfjs = window.pdfjsLib || globalThis.pdfjsLib;

let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let renderTask = null;
let resizeTimer = null;

if (pdfjs) {
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function getTheme() {
  return localStorage.getItem('drafting_theme') || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('drafting_theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function resolveSlideshowPath(project) {
  if (project.fileUrl) {
    return project.fileUrl;
  }

  if (!project.file) {
    return null;
  }

  if (/^https?:\/\//i.test(project.file)) {
    return project.file;
  }

  if (project.file.includes('/')) {
    return project.file;
  }

  return `${slideshowBaseFolder}${project.file}`;
}

function openSlideshowModal(project) {
  const source = resolveSlideshowPath(project);

  if (!source) {
    alert('No slideshow file was provided for this project.');
    return;
  }

  const cleanSource = String(source).split('#')[0].split('?')[0].toLowerCase();

  if (cleanSource.endsWith('.pdf') && pdfjs) {
    openPdfSlideshow(source, project.title || 'Drafting project');
  } else {
    setModalTypeFromSource(source);
    pdfViewer.hidden = true;
    slideshowFrame.hidden = false;
    slideshowFrame.src = source;
    slideshowFrame.title = `${project.title || 'Drafting project'} slideshow`;
  }

  slideshowModal.classList.add('open');
  slideshowModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  slideshowClose.focus();
}

function closeSlideshowModal() {
  slideshowModal.classList.remove('open');
  slideshowModal.setAttribute('aria-hidden', 'true');
  slideshowFrame.src = '';
  pdfViewer.hidden = true;
  slideshowFrame.hidden = false;
  pdfDoc = null;
  currentPage = 1;
  totalPages = 0;
  pageNumLabel.textContent = 'Page: 1 / 1';
  pdfCanvas.width = 0;
  pdfCanvas.height = 0;

  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }

  document.body.style.overflow = '';
}

async function openPdfSlideshow(source, title) {
  setModalTypeFromSource(source);
  slideshowFrame.src = '';
  slideshowFrame.hidden = true;
  pdfViewer.hidden = false;
  pageNumLabel.textContent = 'Loading PDF...';

  try {
    const loadingTask = pdfjs.getDocument(source);
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    currentPage = 1;
    await renderPdfPage(currentPage);
    slideshowFrame.title = `${title} slideshow`;
  } catch (error) {
    console.error('Failed to load PDF slideshow', error);
    pageNumLabel.textContent = 'Could not load PDF.';
  }
}

async function renderPdfPage(pageNumber) {
  if (!pdfDoc) return;

  const page = await pdfDoc.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const context = pdfCanvas.getContext('2d');

  const styles = getComputedStyle(pdfViewer);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const controlsHeight = pdfControls.offsetHeight;
  const availableWidth = Math.max(240, pdfViewer.clientWidth - horizontalPadding);
  const availableHeight = Math.max(240, pdfViewer.clientHeight - verticalPadding - controlsHeight - 10);
  const scale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
  const viewport = page.getViewport({ scale: Math.max(0.1, scale) });
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);

  pdfCanvas.width = Math.floor(viewport.width * pixelRatio);
  pdfCanvas.height = Math.floor(viewport.height * pixelRatio);
  pdfCanvas.style.width = `${Math.floor(viewport.width)}px`;
  pdfCanvas.style.height = `${Math.floor(viewport.height)}px`;

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);

  if (renderTask) {
    renderTask.cancel();
  }

  renderTask = page.render({ canvasContext: context, viewport });
  try {
    await renderTask.promise;
  } catch (error) {
    if (!error || error.name !== 'RenderingCancelledException') {
      throw error;
    }
  }
  renderTask = null;

  pageNumLabel.textContent = `Page: ${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

function goToPreviousPage() {
  if (!pdfDoc || currentPage <= 1) return;
  currentPage -= 1;
  renderPdfPage(currentPage);
}

function goToNextPage() {
  if (!pdfDoc || currentPage >= totalPages) return;
  currentPage += 1;
  renderPdfPage(currentPage);
}

function setModalTypeFromSource(source) {
  slideshowContent.classList.remove(...modalTypeClasses);

  const cleanSource = String(source || '').split('#')[0].split('?')[0].toLowerCase();

  if (cleanSource.endsWith('.pdf')) {
    slideshowContent.classList.add('pdf-mode');
    return;
  }

  slideshowContent.classList.add('slideshow-mode');
}

function renderGrid(projects) {
  const grid = document.getElementById('projectsGrid');
  grid.innerHTML = '';

  projects.forEach((project) => {
    const source = resolveSlideshowPath(project);

    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-icon">${project.icon || '📐'}</div>
      <h3 class="project-title">${project.title || 'Untitled project'}</h3>
      <p class="project-desc">${project.description || ''}</p>
      <div class="project-tags">${(project.tags || []).slice(0, 3).map((tag) => `<span class="tag">${tag}</span>`).join('')}</div>
    `;

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'launch-btn';
    viewBtn.textContent = 'View Slideshow';
    viewBtn.disabled = !source;
    viewBtn.addEventListener('click', () => openSlideshowModal(project));

    const openLink = document.createElement('a');
    openLink.className = 'open-link';
    openLink.textContent = 'Open File';
    openLink.href = source || '#';
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    if (!source) {
      openLink.setAttribute('aria-disabled', 'true');
      openLink.classList.add('is-disabled');
    }

    controls.appendChild(viewBtn);
    controls.appendChild(openLink);
    card.appendChild(controls);
    grid.appendChild(card);
  });
}

async function loadProjects() {
  try {
    const response = await fetch(projectsFile);
    if (!response.ok) {
      throw new Error('Unable to load projects file.');
    }

    const projects = await response.json();
    renderGrid(Array.isArray(projects) ? projects : []);
  } catch (error) {
    document.getElementById('projectsGrid').innerHTML = '<p class="error">Failed to load projects.json</p>';
    console.error(error);
  }
}

themeToggle.addEventListener('click', () => {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

slideshowBackdrop.addEventListener('click', closeSlideshowModal);
slideshowClose.addEventListener('click', closeSlideshowModal);
prevPageBtn.addEventListener('click', goToPreviousPage);
nextPageBtn.addEventListener('click', goToNextPage);

window.addEventListener('keydown', (event) => {
  if (!slideshowModal.classList.contains('open')) {
    return;
  }

  if (event.key === 'Escape') {
    closeSlideshowModal();
  }

  if (event.key === 'ArrowLeft') {
    goToPreviousPage();
  }

  if (event.key === 'ArrowRight') {
    goToNextPage();
  }
});

window.addEventListener('resize', () => {
  if (!slideshowModal.classList.contains('open') || !pdfDoc) {
    return;
  }

  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderPdfPage(currentPage);
  }, 120);
});

setTheme(getTheme());
loadProjects();
