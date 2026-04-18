const SITE = {
  name: "Anh Trinh",
  pageTitle: "Anh Trinh | Photography",
  metaDescription: "Photography portfolio by Anh Trinh, featuring quiet, place-driven work from the San Francisco Bay Area and beyond.",
  eyebrow: "Photography · San Francisco Bay Area",
  heroTitle: "Photographs<br>made with <em>quiet intention.</em>",
  heroText: "A running body of work from the Bay Area and beyond, centered on light, place, and the pause between moments.",
  aboutHeadline: "Based in the<br>San Francisco Bay Area.",
  aboutTagline: "\"Light, place, and the quiet in-between.\"",
  aboutText: "I photograph light, place, and the quieter moments that make a frame feel lasting. This portfolio is an evolving edit of work I keep returning to, organized into collections that feel intentional rather than just chronological.",
  contactDisplay: "Open to commissions,<br>prints &amp; collaborations.",
  contactSub: "Available for work in the Bay Area and beyond.",
  location: "San Francisco Bay Area",
  email: "Trinhanh59@gmail.com",
  instagramUrl: "https://instagram.com/",
  siteUrl: ""
};

const OWNER_PASSWORD = "1077";

const IMAGEKIT_ID          = "sphopalr1";
const IMAGEKIT_PRIVATE_KEY = "private_KIgASXqBKJ+ttIq8bXAjpNbcWxI=";
const IMAGEKIT_UPLOAD_URL  = "https://upload.imagekit.io/api/v1/files/upload";
const IMAGEKIT_BASE_URL    = `https://ik.imagekit.io/${IMAGEKIT_ID}`;

const SUPABASE_URL    = "https://beanpxolozlggbwdoqjl.supabase.co";
const SUPABASE_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYW5weG9sb3psZ2did2RvcWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Mjk5ODgsImV4cCI6MjA5MDMwNTk4OH0.isvxqR-lIk8nchcGdBBXq9OQ2COIyr4AnDO6hOxzLHc";
const SB_TABLE        = "photos";
const SB_ALBUMS_TABLE = "albums";
const SB_HDR          = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`
};

const OWNER_LIBS = {
  exifr: "https://cdn.jsdelivr.net/npm/exifr/dist/full.umd.js",
  heic:  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"
};

const state = {
  ownerMode:       sessionStorage.getItem("ownerMode") === "1",
  photos:          [],
  albums:          [],
  albumGroups:     [],
  activeAlbum:     "all",
  searchQ:         "",
  sortOrder:       "newest",
  activeId:        null,
  reviewMode:      "create",
  reviewQueue:     [],
  reviewUrls:      [],
  pendingDeleteId: null,
  pendingDeleteAlbum: null,
  editingAlbum:    null,
  uploading:       false,
  secretTapCount:  0,
  secretTapTimer:  null,
  loadError:       false
};

let ownerLibrariesPromise = null;
let scrollRevealObserver = null;

const OVERLAYS = ["loginOverlay", "reviewOverlay", "detailOverlay", "confirmOverlay", "albumOverlay"];
const RAW_EXTENSIONS  = /\.(raf|cr2|cr3|nef|nrw|arw|srw|srf|orf|rw2|pef|dng|3fr|mef|mrw|rwl|x3f|iiq)$/i;
const MAX_UPLOAD_MB   = 20;
const MAX_DIMENSION   = 4800;
const COMPRESS_THRESH = 8;

document.addEventListener("DOMContentLoaded", async () => {
  applySiteContent();
  initScrollReveal();
  initNavScroll();
  bindEvents();
  syncOwnerUI();
  handleOwnerHash();
  if (state.ownerMode) {
    ensureOwnerLibraries().catch(err => {
      console.error(err);
      setStatus("Upload tools could not be loaded.");
    });
  }
  await refresh();
});

function applySiteContent() {
  document.title = SITE.pageTitle;
  setText("navBrand", SITE.name);
  setText("heroEyebrow", SITE.eyebrow);
  setHTML("heroTitle", SITE.heroTitle);
  setText("heroText", SITE.heroText);
  setHTML("aboutHeadline", SITE.aboutHeadline);
  setText("aboutTagline", SITE.aboutTagline);
  setText("aboutText", SITE.aboutText);
  setHTML("contactDisplay", SITE.contactDisplay);
  setText("contactSub", SITE.contactSub);
  setText("footerSecretTrigger", `© ${SITE.name} · ${SITE.location}`);

  const mailto = `mailto:${SITE.email}`;
  setAttr("contactEmailBtn", "href", mailto);
  setAttr("contactEmailLink", "href", mailto);
  setText("contactEmailLink", SITE.email);

  const instaIds = ["igBtn", "contactInstagramLink"];
  const hasInstagram = !isPlaceholderInstagram(SITE.instagramUrl);
  instaIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (hasInstagram) {
      el.href = SITE.instagramUrl;
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });

  setAttr("metaDescription", "content", SITE.metaDescription);
  setAttr("ogTitle", "content", SITE.pageTitle);
  setAttr("ogDescription", "content", SITE.metaDescription);
  setAttr("twitterTitle", "content", SITE.pageTitle);
  setAttr("twitterDescription", "content", SITE.metaDescription);
  updateSocialImage(defaultSocialImageUrl());
  updateCanonicalMeta();
}

function defaultSocialImageUrl() {
  try {
    return new URL("social-preview.png", window.location.href).href;
  } catch (_) {
    return "social-preview.png";
  }
}

function updateCanonicalMeta() {
  const canonical = SITE.siteUrl
    ? SITE.siteUrl.replace(/\/$/, "") + window.location.pathname
    : window.location.origin + window.location.pathname;
  setAttr("canonicalLink", "href", canonical);
  setAttr("ogUrl", "content", canonical);
}

function updateSocialImage(src) {
  setAttr("ogImage", "content", src || "");
  setAttr("twitterImage", "content", src || "");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHTML(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = value;
}

function setAttr(id, attr, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, value);
}

function initScrollReveal() {
  if (scrollRevealObserver) {
    scrollRevealObserver.disconnect();
  }
  scrollRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      scrollRevealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".reveal, .reveal-fast, .stagger").forEach(el => {
    if (!el.classList.contains("visible")) scrollRevealObserver.observe(el);
  });
}

function initNavScroll() {
  const nav = document.getElementById("mainNav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function bindEvents() {
  const ownerBtn = document.getElementById("ownerBtn");
  if (ownerBtn) {
    ownerBtn.addEventListener("click", () => {
      if (state.ownerMode) signOut();
      else openOwnerAccess();
    });
  }

  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("signOutBtn").addEventListener("click", signOut);

  document.getElementById("uploadInput").addEventListener("change", e => {
    const files = Array.from(e.target.files || []).filter(isImageFile);
    e.target.value = "";
    if (files.length) processFiles(files);
  });

  document.getElementById("heroUploadBtn").addEventListener("click", () => {
    document.getElementById("uploadInput").click();
  });

  document.getElementById("reviewCancelBtn").addEventListener("click", closeReview);
  document.getElementById("reviewSaveBtn").addEventListener("click", saveReview);

  document.getElementById("prevBtn").addEventListener("click", () => navDetail(-1));
  document.getElementById("nextBtn").addEventListener("click", () => navDetail(1));

  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    const id = state.pendingDeleteId;
    const albumName = state.pendingDeleteAlbum;
    state.pendingDeleteId = null;
    state.pendingDeleteAlbum = null;
    closeOverlay("confirmOverlay");

    if (albumName) {
      try {
        await sbAlbumDelete(albumName);
        closeOverlay("albumOverlay");
        state.editingAlbum = null;
        await refresh();
        setStatus("Collection deleted.");
      } catch (err) {
        console.error(err);
        document.getElementById("albumErr").textContent = err.message || "Could not delete collection.";
        openOverlay("albumOverlay");
      }
      return;
    }

    if (!id) return;
    try {
      await sbDelete(id);
      closeOverlay("detailOverlay");
      await refresh();
      setStatus("Deleted.");
    } catch (err) {
      console.error(err);
      setStatus(`Delete failed: ${err.message}`);
    }
  });

  document.getElementById("searchInput").addEventListener("input", e => {
    state.searchQ = e.target.value.trim().toLowerCase();
    renderFilters();
    renderGallery();
  });

  document.getElementById("sortSel").addEventListener("change", e => {
    state.sortOrder = e.target.value;
    sortPhotos();
    state.albumGroups = buildAlbumGroups(state.photos, state.albums);
    renderSeries();
    renderProjectIntro();
    renderGallery();
  });

  const dz = document.getElementById("dropZone");
  dz.addEventListener("dragover", e => {
    if (!state.ownerMode) return;
    e.preventDefault();
    dz.classList.add("over");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    if (!state.ownerMode) return;
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove("over");
    const files = Array.from(e.dataTransfer.files || []).filter(isImageFile);
    if (files.length) processFiles(files);
  });

  const gallery = document.getElementById("gallery");
  gallery.addEventListener("dragover", e => {
    if (!state.ownerMode) return;
    e.preventDefault();
    dz.classList.add("over");
  });
  gallery.addEventListener("dragleave", e => {
    if (!e.currentTarget.contains(e.relatedTarget)) dz.classList.remove("over");
  });
  gallery.addEventListener("drop", e => {
    if (!state.ownerMode) return;
    e.preventDefault();
    dz.classList.remove("over");
    const files = Array.from(e.dataTransfer.files || []).filter(isImageFile);
    if (files.length) processFiles(files);
  });

  document.getElementById("newAlbumBtn").addEventListener("click", () => openAlbumEditor(null));
  document.getElementById("albumForm").addEventListener("submit", saveAlbum);
  document.getElementById("albumDeleteBtn").addEventListener("click", deleteAlbum);

  document.getElementById("navToggle").addEventListener("click", () => {
    const menu = document.getElementById("mobileMenu");
    setMobileMenu(menu.hidden);
  });

  document.querySelectorAll("[data-nav-close]").forEach(link => {
    link.addEventListener("click", () => setMobileMenu(false));
  });

  document.getElementById("mobileMenu").addEventListener("click", e => {
    if (e.target.id === "mobileMenu") setMobileMenu(false);
  });

  const secretTrigger = document.getElementById("footerSecretTrigger");
  if (secretTrigger) secretTrigger.addEventListener("click", registerSecretTap);

  window.addEventListener("hashchange", handleOwnerHash);

  document.addEventListener("click", e => {
    const closer = e.target.closest("[data-close]");
    if (closer) {
      closeOverlay(closer.dataset.close);
      if (closer.dataset.close === "reviewOverlay") closeReview();
      return;
    }

    if (e.target.classList.contains("modal-overlay")) {
      const id = e.target.id;
      if (id === "reviewOverlay") closeReview();
      else closeOverlay(id);
      return;
    }

    const reset = e.target.closest("[data-reset-gallery]");
    if (reset) {
      resetGallery();
      return;
    }

    const uploadTrigger = e.target.closest("[data-open-upload]");
    if (uploadTrigger) {
      document.getElementById("uploadInput").click();
      return;
    }

    const editAlbum = e.target.closest("[data-album-edit]");
    if (editAlbum) {
      e.stopPropagation();
      openAlbumEditor(editAlbum.dataset.albumEdit);
      return;
    }

    const brick = e.target.closest("[data-photo-id]");
    if (brick && !e.target.closest("[data-action]")) {
      openDetail(brick.dataset.photoId);
      return;
    }

    const action = e.target.closest("[data-action]");
    if (action) {
      const { action: type, photoId } = action.dataset;
      if (type === "edit") startEdit(photoId);
      if (type === "delete") confirmDelete(photoId);
      if (type === "download") downloadPhoto(photoId);
      if (type === "star") toggleStar(photoId);
      if (type === "set-cover") setAlbumCover(photoId);
      if (type === "close") closeOverlay("detailOverlay");
      return;
    }

    const seriesFilter = e.target.closest("[data-series]");
    if (seriesFilter) {
      const series = seriesFilter.dataset.series;
      setActiveAlbum(series, { scrollIntoView: !!seriesFilter.closest(".series-tile") });
      return;
    }

    const starred = e.target.closest("[data-starred-filter]");
    if (starred) {
      state.activeAlbum = state.activeAlbum === "starred" ? "all" : "starred";
      state.searchQ = "";
      document.getElementById("searchInput").value = "";
      renderFilters();
      renderProjectIntro();
      renderGallery();
    }
  });

  document.addEventListener("keydown", e => {
    if ((e.altKey || (e.ctrlKey && e.shiftKey)) && e.key.toLowerCase() === "o") {
      openOwnerAccess();
      return;
    }

    trapFocusInOpenOverlay(e);

    if (e.key === "Escape") {
      if (!document.getElementById("mobileMenu").hidden) {
        setMobileMenu(false);
        return;
      }
      if (document.getElementById("reviewOverlay").classList.contains("open")) {
        closeReview();
        return;
      }
      if (document.getElementById("confirmOverlay").classList.contains("open")) {
        closeOverlay("confirmOverlay");
        return;
      }
      if (document.getElementById("detailOverlay").classList.contains("open")) {
        closeOverlay("detailOverlay");
        return;
      }
      if (document.getElementById("albumOverlay").classList.contains("open")) {
        closeOverlay("albumOverlay");
        return;
      }
      if (document.getElementById("loginOverlay").classList.contains("open")) {
        closeOverlay("loginOverlay");
      }
    }

    if (document.getElementById("detailOverlay").classList.contains("open")) {
      if (e.key === "ArrowLeft") navDetail(-1);
      if (e.key === "ArrowRight") navDetail(1);
    }
  });
}

function registerSecretTap() {
  clearTimeout(state.secretTapTimer);
  state.secretTapCount += 1;
  if (state.secretTapCount >= 3) {
    state.secretTapCount = 0;
    openOwnerAccess();
    return;
  }
  state.secretTapTimer = setTimeout(() => {
    state.secretTapCount = 0;
  }, 1200);
}

function handleOwnerHash() {
  if (window.location.hash.toLowerCase() !== "#owner") return;
  openOwnerAccess();
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

function setMobileMenu(open) {
  const menu = document.getElementById("mobileMenu");
  const toggle = document.getElementById("navToggle");
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("menu-open", open);
}

function openOverlay(id) {
  setMobileMenu(false);
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("open");
  document.body.classList.add("overlay-open");
  const main = document.getElementById("mainContent");
  if (main) main.setAttribute("aria-hidden", "true");
  const nav = document.getElementById("mainNav");
  if (nav) nav.setAttribute("aria-hidden", "true");
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("open");
  const anyOpen = OVERLAYS.some(name => document.getElementById(name).classList.contains("open"));
  if (!anyOpen) {
    document.body.classList.remove("overlay-open");
    const main = document.getElementById("mainContent");
    if (main) main.removeAttribute("aria-hidden");
    const nav = document.getElementById("mainNav");
    if (nav) nav.removeAttribute("aria-hidden");
  }
}

function trapFocusInOpenOverlay(e) {
  if (e.key !== "Tab") return;
  const openId = OVERLAYS.find(name => document.getElementById(name)?.classList.contains("open"));
  if (!openId) return;
  const overlay = document.getElementById(openId);
  const focusable = overlay.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !overlay.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

function openOwnerAccess() {
  if (state.ownerMode) return;
  openOverlay("loginOverlay");
  requestAnimationFrame(() => document.getElementById("pwField").focus());
}

function syncOwnerUI() {
  document.getElementById("ownerBar").classList.toggle("visible", state.ownerMode);
  document.getElementById("heroUploadBtn").classList.toggle("hidden", !state.ownerMode);
  document.getElementById("dropZone").classList.toggle("visible", state.ownerMode);
  document.getElementById("newAlbumBtn").classList.toggle("hidden", !state.ownerMode);

  const ownerBtn = document.getElementById("ownerBtn");
  ownerBtn.title = state.ownerMode ? "Sign out" : "Owner access";
  ownerBtn.setAttribute("aria-label", state.ownerMode ? "Sign out" : "Owner access");

  if (state.ownerMode) {
    ensureOwnerLibraries().catch(err => {
      console.error(err);
      setStatus("Upload tools could not be loaded.");
    });
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const pw = String(new FormData(e.target).get("pw") || "");
  if (pw !== OWNER_PASSWORD) {
    document.getElementById("loginErr").textContent = "Incorrect password.";
    return;
  }

  state.ownerMode = true;
  sessionStorage.setItem("ownerMode", "1");
  e.target.reset();
  document.getElementById("loginErr").textContent = "";
  closeOverlay("loginOverlay");
  syncOwnerUI();
  renderSeries();
  renderProjectIntro();
  renderGallery();
}

function signOut() {
  state.ownerMode = false;
  sessionStorage.removeItem("ownerMode");
  syncOwnerUI();
  closeReview();
  closeOverlay("detailOverlay");
  renderSeries();
  renderProjectIntro();
  renderGallery();
}

function setStatus(msg) {
  const el = document.getElementById("statusTxt");
  if (el) el.textContent = msg;
}

function setProgress(pct) {
  const bar = document.getElementById("uploadProgress");
  const fill = document.getElementById("progressFill");
  if (pct >= 100) {
    bar.classList.remove("visible");
    fill.style.width = "0%";
  } else {
    bar.classList.add("visible");
    fill.style.width = pct + "%";
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find(script => script.src === src);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Could not load ${src}`)), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureOwnerLibraries() {
  if (window.exifr && window.heic2any) return;
  if (ownerLibrariesPromise) return ownerLibrariesPromise;

  ownerLibrariesPromise = Promise.all([
    window.exifr ? Promise.resolve() : loadScript(OWNER_LIBS.exifr),
    window.heic2any ? Promise.resolve() : loadScript(OWNER_LIBS.heic)
  ]).catch(err => {
    ownerLibrariesPromise = null;
    throw err;
  });

  return ownerLibrariesPromise;
}

function isImageFile(file) {
  const name = String(file.name || "");
  if (RAW_EXTENSIONS.test(name)) return false;
  return (file.type && file.type.startsWith("image/")) || /\.(heic|heif|png|jpg|jpeg|webp)$/i.test(name) || !name;
}

async function processFiles(files) {
  files = Array.from(files).filter(isImageFile);
  if (!state.ownerMode || !files.length) return;
  if (state.uploading) {
    setStatus("Still processing the previous batch. Try again in a moment.");
    return;
  }

  state.uploading = true;
  const unlockTimer = setTimeout(() => {
    state.uploading = false;
  }, 300000);

  const reviewUrls = [];
  const drafts = [];
  let skipped = 0;

  try {
    await ensureOwnerLibraries();
    if (state.reviewQueue.length) closeReview();
    setProgress(3);

    for (let i = 0; i < files.length; i += 1) {
      const label = files.length > 1 ? ` (${i + 1}/${files.length})` : "";
      setStatus(`Reading metadata${label}...`);
      const meta = await extractMeta(files[i]);

      try {
        const preparedFile = await prepareFile(files[i], label);
        const previewUrl = URL.createObjectURL(preparedFile);
        reviewUrls.push(previewUrl);
        drafts.push({
          draftId: genId(),
          existing: false,
          id: meta.id,
          file: preparedFile,
          previewUrl,
          cloudinaryId: null,
          title: meta.title,
          description: meta.description,
          series: meta.series,
          dateTaken: meta.dateTaken,
          location: meta.location,
          coordinates: meta.coordinates,
          camera: meta.camera,
          lens: meta.lens,
          aperture: meta.aperture,
          shutterSpeed: meta.shutterSpeed,
          iso: meta.iso,
          focalLength: meta.focalLength,
          uploadedAt: meta.uploadedAt,
          orderTimestamp: meta.orderTimestamp,
          starred: meta.starred
        });
      } catch (err) {
        console.error(err);
        skipped += 1;
        setStatus(`Skipped${label}: ${err.message}`);
      }

      setProgress(5 + Math.round(((i + 1) / files.length) * 90));
    }

    if (!drafts.length) {
      reviewUrls.forEach(url => URL.revokeObjectURL(url));
      setStatus("No photos were ready to review.");
      return;
    }

    state.reviewMode = "create";
    state.reviewQueue = drafts;
    state.reviewUrls = reviewUrls;
    renderReview();
    openOverlay("reviewOverlay");

    const countText = `${drafts.length} photo${drafts.length === 1 ? "" : "s"} ready to review`;
    setStatus(skipped ? `${countText}, ${skipped} skipped.` : `${countText}.`);
  } catch (err) {
    console.error(err);
    reviewUrls.forEach(url => URL.revokeObjectURL(url));
    setStatus(err.message || "Could not prepare uploads for review.");
  } finally {
    clearTimeout(unlockTimer);
    state.uploading = false;
    setProgress(100);
  }
}

async function prepareFile(file, label = "") {
  let blob = await heicToBlob(file);
  const isBig = blob.size > COMPRESS_THRESH * 1024 * 1024;
  const isPng = blob.type === "image/png";

  if (isBig || isPng) {
    setStatus(`Compressing${label}...`);
    blob = await compressImage(blob);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName || "photo"}.jpg`, { type: "image/jpeg" });
}

async function heicToBlob(file) {
  const isHeic = /\.(heic|heif)$/i.test(file.name)
    || file.type === "image/heic"
    || file.type === "image/heif";

  if (!isHeic) return file;
  setStatus("Converting HEIC...");

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = Object.assign(document.createElement("canvas"), {
      width: bitmap.width,
      height: bitmap.height
    });
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    if (blob && blob.size > 1000) return blob;
  } catch (_) {
    /* ignore and fall through */
  }

  if (window.heic2any) {
    try {
      const out = await Promise.race([
        window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("heic2any timed out")), 30000))
      ]);
      const blob = Array.isArray(out) ? out[0] : out;
      if (blob && blob.size > 1000) return blob;
    } catch (_) {
      /* ignore and fall through */
    }
  }

  throw new Error("HEIC conversion failed. Export the photo as JPEG and try again.");
}

async function compressImage(blob) {
  const bitmap = await createImageBitmap(blob);
  let width = bitmap.width;
  let height = bitmap.height;

  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const limitBytes = MAX_UPLOAD_MB * 1024 * 1024;
  for (const quality of [0.88, 0.82, 0.75, 0.65, 0.55]) {
    const out = await canvasToBlob(canvas, "image/jpeg", quality);
    if (out && (out.size <= limitBytes || quality === 0.55)) return out;
  }
  return canvasToBlob(canvas, "image/jpeg", 0.55);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode image. Try a different file."));
    }, type, quality);
  });
}

async function extractMeta(file) {
  let exif = {};
  try {
    exif = await window.exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true
    }) || {};
  } catch (_) {
    exif = {};
  }

  let lat = exif.latitude;
  let lon = exif.longitude;
  if ((lat == null || lon == null) && window.exifr?.gps) {
    try {
      const gps = await window.exifr.gps(file);
      if (gps) {
        lat = gps.latitude;
        lon = gps.longitude;
      }
    } catch (_) {
      /* ignore */
    }
  }

  const latStr = lat != null ? Number(lat).toFixed(5) : "";
  const lonStr = lon != null ? Number(lon).toFixed(5) : "";
  const rawDate = exif.DateTimeOriginal || exif.CreateDate || exif.DateTime || exif.DateTimeDigitized;
  const dateTaken = fmtDateInput(rawDate);

  const clean = value => str(value).replace(/[\0-\x1F\x7F-\x9F]/g, "").trim();
  const make = clean(exif.Make || "");
  const model = clean(exif.Model || "");
  const camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : compact([make, model]);
  const lens = clean(exif.LensModel || exif.Lens || exif.LensInfo || "");
  const isoRaw = exif.ISO ?? exif.ISOSpeedRatings ?? exif.PhotographicSensitivity;
  const embeddedTitle = clean(exif.ObjectName || exif.Headline || exif.Title || "");
  const embeddedDesc = clean(exif.ImageDescription || exif.Description || exif["Caption-Abstract"] || exif.Caption || "");
  const location = buildExifLocation(exif);

  return {
    id: genId(),
    cloudinaryId: null,
    title: embeddedTitle || titleize(file.name),
    description: embeddedDesc,
    series: "",
    dateTaken,
    location,
    coordinates: latStr && lonStr ? `${latStr}, ${lonStr}` : "",
    camera,
    lens,
    aperture: fmtAperture(exif.FNumber),
    shutterSpeed: fmtShutter(exif.ExposureTime),
    iso: isoRaw != null ? String(isoRaw) : "",
    focalLength: fmtFocal(exif.FocalLength),
    uploadedAt: new Date().toISOString(),
    orderTimestamp: dateTaken ? new Date(dateTaken).getTime() : Date.now(),
    starred: false
  };
}

function buildExifLocation(exif) {
  const clean = value => str(value).replace(/[\0-\x1F\x7F-\x9F]/g, "").trim();
  const place = clean(exif.SubLocation || exif.Location || exif.LocationShown || exif.LocationCreated || "");
  const city = clean(exif.City || exif.CreatorCity || "");
  const region = clean(exif.State || exif.ProvinceState || exif["Province-State"] || exif.StateProvince || exif.RegionName || "");
  const country = clean(exif.Country || exif.CountryName || "");

  const parts = [];
  if (place) parts.push(place);
  const locality = [city, region].filter(Boolean).join(", ");
  if (locality) parts.push(locality);
  if (country) parts.push(country);
  return parts.join(", ");
}

function makeDraft(photo) {
  return {
    draftId: genId(),
    existing: true,
    id: photo.id,
    file: null,
    previewUrl: photo.cloudinaryId ? cloudinaryUrl(photo.cloudinaryId, "w_600,q_auto,f_auto") : "",
    cloudinaryId: photo.cloudinaryId,
    title: photo.title || "",
    description: photo.description || "",
    series: photo.series || "",
    dateTaken: photo.dateTaken || "",
    location: photo.location || "",
    coordinates: photo.coordinates || "",
    camera: photo.camera || "",
    lens: photo.lens || "",
    aperture: photo.aperture || "",
    shutterSpeed: photo.shutterSpeed || "",
    iso: photo.iso || "",
    focalLength: photo.focalLength || "",
    uploadedAt: photo.uploadedAt || new Date().toISOString(),
    orderTimestamp: photo.orderTimestamp || Date.now(),
    starred: photo.starred || false
  };
}

function renderReview() {
  const editing = state.reviewMode === "edit";
  document.getElementById("reviewLabel").textContent = editing ? "Edit photograph" : "Review upload";
  document.getElementById("reviewTitle").textContent = editing ? "Adjust details before saving" : "Check details before publishing";
  document.getElementById("reviewSaveBtn").textContent = editing ? "Update photograph" : "Publish to portfolio";
  document.getElementById("reviewFootNote").textContent = editing
    ? "Save changes to update this photograph."
    : "Nothing is published until you save.";

  document.getElementById("reviewList").innerHTML = state.reviewQueue.map(draft => {
    return `
      <div class="review-item">
        <div class="review-preview"><img src="${escA(draft.previewUrl)}" alt="Preview of ${escA(draft.title || "photograph")}" /></div>
        <form class="review-form" data-draft-id="${escA(draft.draftId)}">
          <div class="f-row">
            <div class="field"><label>Title</label><input name="title" type="text" value="${escA(draft.title)}" placeholder="Untitled" /></div>
            <div class="field"><label>Collection</label><input name="series" type="text" value="${escA(draft.series)}" placeholder="e.g. Quiet Coast" /></div>
          </div>
          <div class="field"><label>Description</label><textarea name="description" placeholder="Optional caption">${esc(draft.description)}</textarea></div>
          <div class="f-row">
            <div class="field"><label>Date taken</label><input name="dateTaken" type="date" value="${escA(draft.dateTaken)}" /></div>
            <div class="field"><label>Location</label><input name="location" type="text" value="${escA(draft.location)}" placeholder="City or region" /></div>
          </div>
          <div class="f-row">
            <div class="field"><label>Camera</label><input name="camera" type="text" value="${escA(draft.camera)}" placeholder="Leica Q2" /></div>
            <div class="field"><label>Lens</label><input name="lens" type="text" value="${escA(draft.lens)}" placeholder="Optional" /></div>
          </div>
          <div class="f-row three">
            <div class="field"><label>Aperture</label><input name="aperture" type="text" value="${escA(draft.aperture)}" placeholder="f/2.8" /></div>
            <div class="field"><label>Shutter</label><input name="shutterSpeed" type="text" value="${escA(draft.shutterSpeed)}" placeholder="1/250 sec" /></div>
            <div class="field"><label>ISO</label><input name="iso" type="text" value="${escA(draft.iso)}" placeholder="400" /></div>
          </div>
          <div class="f-row">
            <div class="field"><label>Focal length</label><input name="focalLength" type="text" value="${escA(draft.focalLength)}" placeholder="35mm" /></div>
            <div class="field"><label>Coordinates (private)</label><input name="coordinates" type="text" value="${escA(draft.coordinates)}" placeholder="Optional - hidden from visitors" /></div>
          </div>
          <label class="featured-toggle">
            <input type="checkbox" name="starred" ${draft.starred ? "checked" : ""} />
            <span class="featured-toggle-label">Mark as featured</span>
          </label>
        </form>
      </div>`;
  }).join("");
}

async function saveReview() {
  const forms = Array.from(document.getElementById("reviewList").querySelectorAll(".review-form"));
  if (!forms.length || !state.ownerMode) return;

  const creating = state.reviewMode === "create";
  let saved = 0;
  let skipped = 0;
  const failedDrafts = [];
  const failedUrls = [];

  state.uploading = true;
  setProgress(5);
  setStatus(creating ? "Publishing..." : "Saving changes...");

  for (let i = 0; i < forms.length; i += 1) {
    const form = forms[i];
    const draft = state.reviewQueue.find(item => item.draftId === form.dataset.draftId);
    if (!draft) continue;

    const label = forms.length > 1 ? ` (${i + 1}/${forms.length})` : "";
    const fd = new FormData(form);
    const dateTaken = str(fd.get("dateTaken"));
    const photo = {
      id: draft.id,
      cloudinaryId: draft.cloudinaryId || null,
      uploadedAt: draft.uploadedAt || new Date().toISOString(),
      orderTimestamp: dateTaken ? new Date(dateTaken).getTime() : draft.orderTimestamp || Date.now(),
      title: str(fd.get("title")) || "Untitled",
      series: str(fd.get("series")),
      description: str(fd.get("description")),
      dateTaken,
      location: str(fd.get("location")),
      coordinates: str(fd.get("coordinates")),
      camera: str(fd.get("camera")),
      lens: str(fd.get("lens")),
      aperture: str(fd.get("aperture")),
      shutterSpeed: str(fd.get("shutterSpeed")),
      iso: str(fd.get("iso")),
      focalLength: str(fd.get("focalLength")),
      starred: fd.get("starred") === "on"
    };

    try {
      if (creating && !photo.cloudinaryId) {
        setStatus(`Uploading${label}...`);
        photo.cloudinaryId = await uploadPreparedFile(draft.file, draft.id);
      }

      if (photo.series) {
        await ensureAlbumExists(photo.series, photo.cloudinaryId || "");
      }

      await sbUpsert(photo);
      saved += 1;

      if (creating && draft.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(draft.previewUrl);
      }
    } catch (err) {
      console.error(err);
      skipped += 1;
      failedDrafts.push({ ...draft, ...photo, cloudinaryId: photo.cloudinaryId || draft.cloudinaryId || null });
      if (creating && draft.previewUrl.startsWith("blob:")) failedUrls.push(draft.previewUrl);
      setStatus(`${creating ? "Publish" : "Save"} failed${label}: ${err.message}`);
    }

    setProgress(5 + Math.round(((i + 1) / forms.length) * 93));
  }

  state.uploading = false;
  setProgress(100);

  if (failedDrafts.length) {
    state.reviewQueue = failedDrafts;
    state.reviewUrls = failedUrls;
    state.reviewMode = creating ? "create" : "edit";
    renderReview();
    openOverlay("reviewOverlay");
    setStatus(saved > 0 ? `${saved} saved, ${skipped} still need attention.` : `Nothing saved. ${skipped} item${skipped === 1 ? "" : "s"} still need attention.`);
    return;
  }

  closeReview();
  await refresh();

  if (creating) {
    setStatus(`${saved} photo${saved === 1 ? "" : "s"} published.`);
  } else {
    setStatus("Updated.");
  }
}

function closeReview() {
  state.reviewUrls.forEach(url => URL.revokeObjectURL(url));
  state.reviewUrls = [];
  state.reviewQueue = [];
  state.reviewMode = "create";
  closeOverlay("reviewOverlay");
}

async function uploadPreparedFile(file, photoId) {
  if (!file) throw new Error("Missing file for upload.");
  const ikName = `${photoId}.jpg`;
  const form = new FormData();
  form.append("file", file);
  form.append("fileName", ikName);
  form.append("useUniqueFileName", "false");
  form.append("folder", "/portfolio");

  const auth = btoa(IMAGEKIT_PRIVATE_KEY + ":");
  const res = await fetch(IMAGEKIT_UPLOAD_URL, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}` },
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data.filePath;
}

function renderHero() {
  const cover = state.photos.find(photo => photo.starred && photo.cloudinaryId)
    || state.photos.find(photo => photo.cloudinaryId);
  const el = document.getElementById("heroCoverImg");
  if (!el) return;

  if (cover) {
    el.src = cloudinaryUrl(cover.cloudinaryId, "w_1600,q_80,f_auto");
    el.alt = cover.title ? `Featured photograph: ${cover.title}` : "Featured photograph";
    el.classList.remove("hidden");
    updateSocialImage(cloudinaryUrl(cover.cloudinaryId, "w_1200,q_80,f_auto"));
  } else {
    el.removeAttribute("src");
    el.alt = "Featured photograph";
    el.classList.add("hidden");
    updateSocialImage(defaultSocialImageUrl());
  }
}

async function refresh() {
  try {
    [state.photos, state.albums] = await Promise.all([sbGetAll(), sbAlbumsGetAll()]);
    state.loadError = false;
  } catch (err) {
    console.error("Could not load portfolio data", err);
    state.photos = state.photos || [];
    state.albums = state.albums || [];
    state.loadError = true;
    setStatus("Could not load portfolio. Check your connection and refresh.");
  }
  sortPhotos();
  state.albumGroups = buildAlbumGroups(state.photos, state.albums);

  const albumNames = new Set(state.albumGroups.map(group => group.name));
  if (state.activeAlbum !== "all" && state.activeAlbum !== "starred" && !albumNames.has(state.activeAlbum)) {
    state.activeAlbum = "all";
  }

  renderHero();
  renderStats();
  renderSeries();
  renderNavAlbums();
  renderFilters();
  renderProjectIntro();
  renderGallery();
  initScrollReveal();
}

function sortPhotos() {
  if (state.sortOrder === "newest") {
    state.photos.sort((a, b) => (b.orderTimestamp || 0) - (a.orderTimestamp || 0));
  } else if (state.sortOrder === "oldest") {
    state.photos.sort((a, b) => (a.orderTimestamp || 0) - (b.orderTimestamp || 0));
  } else if (state.sortOrder === "title") {
    state.photos.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }
}

function filtered() {
  let photos = state.photos;
  if (state.activeAlbum === "starred") {
    photos = photos.filter(photo => photo.starred);
  } else if (state.activeAlbum !== "all") {
    photos = photos.filter(photo => photo.series === state.activeAlbum);
  }

  if (state.searchQ) {
    const q = state.searchQ;
    photos = photos.filter(photo => [photo.title, photo.series, photo.location, photo.description, photo.camera]
      .some(value => (value || "").toLowerCase().includes(q)));
  }

  return photos;
}

function renderStats() {
  document.getElementById("statPhotos").textContent = state.photos.length;
  document.getElementById("statAlbums").textContent = state.albumGroups.length;
  document.getElementById("statFeatured").textContent = state.photos.filter(photo => photo.starred).length;
}

function buildAlbumGroups(photos, albums) {
  const map = new Map();

  albums.forEach(album => {
    map.set(album.name, {
      name: album.name,
      count: 0,
      latestDate: "",
      latestTimestamp: 0,
      earliestTimestamp: 0,
      description: album.description || "",
      cover: album.coverCloudinaryId || "",
      sortOrder: Number(album.sortOrder) || 0,
      hasCustomSort: Number(album.sortOrder) > 0,
      createdAt: album.createdAt || ""
    });
  });

  photos.forEach(photo => {
    if (!photo.series) return;
    const existing = map.get(photo.series) || {
      name: photo.series,
      count: 0,
      latestDate: "",
      latestTimestamp: 0,
      earliestTimestamp: 0,
      description: "",
      cover: "",
      sortOrder: 0,
      hasCustomSort: false,
      createdAt: ""
    };

    existing.count += 1;
    const ts = photoTimestamp(photo);
    if (!existing.latestTimestamp || ts >= existing.latestTimestamp) {
      existing.latestTimestamp = ts;
      existing.latestDate = fmtDisplay(photo.dateTaken || photo.uploadedAt) || "Recently added";
    }
    if (!existing.earliestTimestamp || ts < existing.earliestTimestamp) {
      existing.earliestTimestamp = ts;
    }
    if (!existing.cover && photo.cloudinaryId) {
      existing.cover = photo.cloudinaryId;
    }
    map.set(photo.series, existing);
  });

  return Array.from(map.values())
    .filter(group => group.name && (group.count > 0 || albums.some(album => album.name === group.name)))
    .sort((a, b) => {
      if (a.hasCustomSort !== b.hasCustomSort) return a.hasCustomSort ? -1 : 1;
      if (a.hasCustomSort && b.hasCustomSort) {
        return a.sortOrder - b.sortOrder || (b.latestTimestamp || 0) - (a.latestTimestamp || 0) || a.name.localeCompare(b.name);
      }
      return (b.latestTimestamp || 0) - (a.latestTimestamp || 0) || a.name.localeCompare(b.name);
    });
}

function renderSeries() {
  const groups = state.albumGroups;
  const wrap = document.getElementById("seriesWrap");

  if (!groups.length) {
    wrap.className = "stagger";
    if (state.loadError) {
      wrap.innerHTML = `<div class="empty-placeholder">Collections are temporarily unavailable. Please refresh in a moment.</div>`;
    } else {
      wrap.innerHTML = `<div class="empty-placeholder">Collections appear as the archive grows${state.ownerMode ? ', or create one above.' : '.'}</div>`;
    }
    return;
  }

  wrap.className = "";
  wrap.innerHTML = `<div class="series-grid">${groups.map(group => {
    const bgLayer = group.cover
      ? `<div class="series-tile-bg" style="background-image:url('${cloudinaryUrl(group.cover, "w_700,q_auto,f_auto")}')"></div><div class="series-tile-cover-overlay"></div>`
      : "";
    const editBtn = state.ownerMode
      ? `<button type="button" class="btn-quiet album-edit-btn" data-album-edit="${escA(group.name)}">Edit</button>`
      : "";
    const countText = group.count > 0
      ? `${group.count} photograph${group.count === 1 ? "" : "s"}`
      : "Collection in progress";
    const descText = group.description
      ? `<div class="series-tile-desc">${esc(group.description)}</div>`
      : "";
    return `
      <button type="button" class="series-tile reveal ${group.cover ? "" : "no-cover"}" data-series="${escA(group.name)}" aria-label="Open collection ${escA(group.name)}">
        ${bgLayer}
        ${editBtn}
        <div class="series-tile-content">
          <div class="series-tile-count">${esc(countText)}</div>
          <div class="series-tile-name">${esc(group.name)}</div>
          ${descText}
          <div class="series-tile-date">${esc(group.latestDate || "Recently added")}</div>
        </div>
      </button>`;
  }).join("")}</div>`;
}

function renderNavAlbums() {
  const albumsContainer = document.getElementById("navAlbumsDropdown");
  const mobileAlbumsContainer = document.getElementById("mobileAlbumsList");

  if (albumsContainer) {
    let html = `<a href="#collections" class="nav-dropdown-item" data-series="all">View all collections</a>`;
    state.albumGroups.forEach(group => {
      html += `<a href="#gallery" class="nav-dropdown-item" data-series="${escA(group.name)}">${esc(group.name)}</a>`;
    });
    albumsContainer.innerHTML = html;
  }

  if (mobileAlbumsContainer) {
    let mobileHtml = `<a href="#collections" data-nav-close data-series="all">View all collections</a>`;
    state.albumGroups.forEach(group => {
      mobileHtml += `<a href="#gallery" data-nav-close data-series="${escA(group.name)}">${esc(group.name)}</a>`;
    });
    mobileAlbumsContainer.innerHTML = mobileHtml;
  }
}

function renderFilters() {
  const albums = state.albumGroups.map(group => group.name);
  const isStarred = state.activeAlbum === "starred";
  const starredCount = state.photos.filter(photo => photo.starred).length;

  const albumChips = [{ value: "all", label: "All" }, ...albums.map(name => ({ value: name, label: name }))]
    .map(filter => {
      const active = !isStarred && state.activeAlbum === filter.value;
      return `<button type="button" class="chip ${active ? "active" : ""}" data-series="${escA(filter.value)}" aria-pressed="${active ? "true" : "false"}">${esc(filter.label)}</button>`;
    }).join("");

  const starChip = starredCount > 0
    ? `<button type="button" class="chip starred-chip ${isStarred ? "active" : ""}" data-starred-filter="1" aria-pressed="${isStarred ? "true" : "false"}">Featured (${starredCount})</button>`
    : "";

  document.getElementById("filterPills").innerHTML = albumChips + starChip;
}

function renderProjectIntro() {
  const wrap = document.getElementById("projectIntro");
  if (!wrap) return;

  if (state.activeAlbum === "all") {
    wrap.innerHTML = "";
    return;
  }

  if (state.activeAlbum === "starred") {
    const featured = state.photos.filter(photo => photo.starred);
    if (!featured.length) {
      wrap.innerHTML = "";
      return;
    }

    const cover = featured.find(photo => photo.cloudinaryId)?.cloudinaryId || "";
    const image = cover
      ? `<div class="project-media"><img src="${escA(cloudinaryUrl(cover, "w_1200,q_auto,f_auto"))}" alt="Featured photographs" loading="lazy" /></div>`
      : "";
    const projectClass = cover ? "project-spotlight reveal" : "project-spotlight no-cover reveal";

    wrap.innerHTML = `
      <div class="${projectClass}">
        ${image}
        <div class="project-body">
          <p class="project-kicker">Featured edit</p>
          <h3 class="project-title">A tighter selection of photographs</h3>
          <p class="project-summary">A focused edit of photographs that anchor the portfolio and set its tone. Use this view when you want the most distilled version of the archive.</p>
          <div class="project-meta-grid">
            <div class="project-meta-item"><span class="project-meta-k">Photographs</span><span class="project-meta-v">${featured.length}</span></div>
            <div class="project-meta-item"><span class="project-meta-k">Collections</span><span class="project-meta-v">${new Set(featured.map(photo => photo.series).filter(Boolean)).size || 1}</span></div>
          </div>
          <div class="project-actions">
            <button type="button" class="btn-ghost" data-series="all">View all work</button>
            <a class="btn" href="${escA(`mailto:${SITE.email}`)}">Get in touch</a>
          </div>
        </div>
      </div>`;
    return;
  }

  const group = state.albumGroups.find(item => item.name === state.activeAlbum);
  if (!group) {
    wrap.innerHTML = "";
    return;
  }

  const orderedNames = state.albumGroups.map(item => item.name);
  const currentIndex = orderedNames.indexOf(group.name);
  const nextName = currentIndex >= 0 ? orderedNames[(currentIndex + 1) % orderedNames.length] : "";
  const dateSpan = formatAlbumDateSpan(group);
  const image = group.cover
    ? `<div class="project-media"><img src="${escA(cloudinaryUrl(group.cover, "w_1400,q_auto,f_auto"))}" alt="${escA(group.name)} collection cover" loading="lazy" /></div>`
    : "";
  const description = group.description || "A focused body of work gathered into a single collection.";
  const projectClass = group.cover ? "project-spotlight reveal" : "project-spotlight no-cover reveal";
  const ownerActions = state.ownerMode
    ? `<button type="button" class="btn-ghost" data-album-edit="${escA(group.name)}">Edit collection</button>`
    : "";

  wrap.innerHTML = `
    <div class="${projectClass}">
      ${image}
      <div class="project-body">
        <p class="project-kicker">Collection</p>
        <h3 class="project-title">${esc(group.name)}</h3>
        <p class="project-summary">${esc(description)}</p>
        <div class="project-meta-grid">
          <div class="project-meta-item"><span class="project-meta-k">Photographs</span><span class="project-meta-v">${group.count}</span></div>
          <div class="project-meta-item"><span class="project-meta-k">Span</span><span class="project-meta-v">${esc(dateSpan)}</span></div>
          <div class="project-meta-item"><span class="project-meta-k">Latest</span><span class="project-meta-v">${esc(group.latestDate || "Recently added")}</span></div>
        </div>
        <div class="project-actions">
          <button type="button" class="btn-ghost" data-series="all">View all work</button>
          ${nextName && nextName !== group.name ? `<button type="button" class="btn-quiet" data-series="${escA(nextName)}">Next collection</button>` : ""}
          ${ownerActions}
        </div>
      </div>
    </div>`;
}

function renderGallery() {
  const photos = filtered();
  const wrap = document.getElementById("galleryWrap");

  if (!photos.length) {
    const noPhotos = state.photos.length === 0;
    const viewingCollection = state.activeAlbum !== "all" && state.activeAlbum !== "starred";

    if (noPhotos && state.loadError) {
      wrap.innerHTML = `
        <div class="empty">
          <h3>Photographs are temporarily unavailable.</h3>
          <p>The archive could not be reached. Please refresh the page in a moment, or check back shortly.</p>
          <div class="empty-actions"><button type="button" class="btn-quiet" onclick="location.reload()">Reload</button></div>
        </div>`;
      return;
    }

    const title = noPhotos
      ? "Selected work is on the way."
      : viewingCollection
        ? "This collection is still in progress."
        : "No photographs found.";
    const message = noPhotos
      ? "This portfolio updates as new work is added to the archive."
      : viewingCollection
        ? "Try another collection, or return to all work."
        : "Try a different filter or clear the search.";

    wrap.innerHTML = `
      <div class="empty">
        <h3>${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="empty-actions">${emptyActions(noPhotos)}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `<div class="photo-grid">${photos.map(photo => {
    const src = cloudinaryUrl(photo.cloudinaryId, "w_900,q_auto,f_auto");
    const starBadge = photo.starred ? `<div class="photo-star-badge">★</div>` : "";
    const metaText = compact([photo.series, photo.location]);
    return `
      <button type="button" class="photo-brick reveal-fast" data-photo-id="${escA(photo.id)}" aria-label="Open ${escA(photo.title || "photograph")}">
        <img src="${escA(src)}" alt="${escA(photo.title || "Photograph")}" loading="lazy" decoding="async" />
        ${starBadge}
        <div class="photo-brick-overlay">
          <div class="photo-brick-title">${esc(photo.title || "Untitled")}</div>
          <div class="photo-brick-meta">${esc(metaText || photo.location || "")}</div>
        </div>
      </button>`;
  }).join("")}</div>`;

  initScrollReveal();
}

function emptyActions(noPhotos) {
  if (noPhotos && state.ownerMode) {
    return `<button type="button" class="btn" data-open-upload="1">Upload photographs</button>`;
  }
  if (noPhotos) {
    return `<a class="btn" href="mailto:${escA(SITE.email)}">Get in touch</a>`;
  }
  return `<button type="button" class="btn-quiet" data-reset-gallery="1">Clear filters</button>`;
}

function setActiveAlbum(albumName, { scrollIntoView = false } = {}) {
  state.activeAlbum = albumName;
  state.searchQ = "";
  document.getElementById("searchInput").value = "";
  renderFilters();
  renderProjectIntro();
  renderGallery();
  if (scrollIntoView) {
    document.getElementById("gallery").scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

function resetGallery() {
  state.searchQ = "";
  state.activeAlbum = "all";
  document.getElementById("searchInput").value = "";
  renderFilters();
  renderProjectIntro();
  renderGallery();
}

function openDetail(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) return;
  state.activeId = id;
  renderDetail(photo);
  openOverlay("detailOverlay");
}

function renderDetail(photo) {
  const photos = filtered();
  const index = photos.findIndex(item => item.id === photo.id);
  const image = document.getElementById("detailImg");

  document.getElementById("detailCounter").textContent = photos.length > 1 ? `${index + 1} of ${photos.length}` : "Photograph";
  document.getElementById("detailTitle").textContent = photo.title || "Untitled";
  document.getElementById("detailDesc").textContent = photo.description || "No description added.";

  const detailSrc = cloudinaryUrl(photo.cloudinaryId, "w_2000,q_auto,f_auto");
  image.style.opacity = "0";
  image.onload = () => { image.style.opacity = "1"; };
  image.onerror = () => { image.style.opacity = "1"; };
  if (detailSrc) {
    image.src = detailSrc;
  } else {
    image.removeAttribute("src");
    image.style.opacity = "1";
  }

  const tags = [
    photo.starred && `<span class="tag featured-tag">Featured</span>`,
    photo.series && `<span class="tag">Collection · ${esc(photo.series)}</span>`
  ];
  if (state.ownerMode) {
    if (photo.camera) tags.push(`<span class="tag">${esc(photo.camera)}</span>`);
    if (photo.lens) tags.push(`<span class="tag">${esc(photo.lens)}</span>`);
  }
  document.getElementById("detailTags").innerHTML = tags.filter(Boolean).join("");

  const publicMeta = [
    ["Collection", photo.series || "-"],
    ["Date", fmtDisplay(photo.dateTaken) || "-"],
    ["Location", photo.location || "-"],
    ["Camera", photo.camera || "-"]
  ];

  const ownerMeta = [
    ["Lens", photo.lens || "-"],
    ["Aperture", photo.aperture || "-"],
    ["Shutter", photo.shutterSpeed || "-"],
    ["ISO", photo.iso || "-"],
    ["Focal length", photo.focalLength || "-"],
    ["Coordinates", photo.coordinates || "-"],
    ["Added", fmtDateTime(photo.uploadedAt) || "-"]
  ];

  const meta = state.ownerMode ? [...publicMeta, ...ownerMeta] : publicMeta;
  document.getElementById("detailMeta").innerHTML = meta.map(([key, value]) => `
    <div class="meta-cell"><div class="meta-k">${esc(key)}</div><div class="meta-v">${esc(value)}</div></div>`).join("");

  document.getElementById("prevBtn").disabled = index <= 0;
  document.getElementById("nextBtn").disabled = index >= photos.length - 1;

  if (state.ownerMode) {
    const starred = photo.starred;
    const coverAction = photo.series && photo.cloudinaryId
      ? `<button class="btn-quiet" data-action="set-cover" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Set as collection cover</button>`
      : "";
    document.getElementById("detailActions").innerHTML = `
      <button class="star-toggle-btn ${starred ? "starred" : ""}" data-action="star" data-photo-id="${escA(photo.id)}" title="${starred ? "Unfeature" : "Mark as featured"}" aria-label="${starred ? "Unfeature photograph" : "Mark photograph as featured"}">
        ${starred ? "★" : "☆"}
      </button>
      <button class="btn-ghost" data-action="edit" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Edit</button>
      ${coverAction}
      <button class="btn-quiet" data-action="download" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Download</button>
      <button class="btn-danger" data-action="delete" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;border-radius:999px;border:1px solid rgba(224,112,112,0.35);color:var(--danger);cursor:pointer;background:transparent;">Delete</button>
      <button class="btn-quiet" data-action="close" style="font-size:0.78rem;min-height:36px;padding:7px 16px;margin-left:auto;">Close</button>`;
  } else {
    document.getElementById("detailActions").innerHTML = `
      <a class="btn" href="${escA(buildInquiryLink(photo))}">Inquire about this photograph</a>
      <button class="btn-quiet" data-action="close" style="font-size:0.78rem;min-height:36px;padding:7px 16px;margin-left:auto;">Close</button>`;
  }
}

function navDetail(direction) {
  const photos = filtered();
  const index = photos.findIndex(photo => photo.id === state.activeId);
  const next = photos[index + direction];
  if (!next) return;
  state.activeId = next.id;
  renderDetail(next);
}

async function toggleStar(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo || !state.ownerMode) return;

  const previous = photo.starred;
  photo.starred = !photo.starred;
  renderDetail(photo);
  renderGallery();
  renderFilters();
  renderHero();
  renderStats();

  try {
    await sbToggleStar(id, photo.starred);
    setStatus(photo.starred ? "Marked as featured." : "Removed from featured.");
  } catch (err) {
    console.error(err);
    photo.starred = previous;
    renderDetail(photo);
    renderGallery();
    renderFilters();
    renderHero();
    renderStats();
    setStatus(`Feature update failed: ${err.message}`);
  }
}

async function setAlbumCover(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo || !state.ownerMode || !photo.series || !photo.cloudinaryId) return;

  try {
    await ensureAlbumExists(photo.series, photo.cloudinaryId);
    const existing = state.albums.find(album => album.name === photo.series);
    await sbAlbumUpsert({
      name: photo.series,
      description: existing?.description || "",
      coverCloudinaryId: photo.cloudinaryId,
      sortOrder: existing?.sortOrder || 0
    });
    await refresh();
    openDetail(photo.id);
    setStatus("Collection cover updated.");
  } catch (err) {
    console.error(err);
    setStatus(`Could not update collection cover: ${err.message}`);
  }
}

function downloadPhoto(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) {
    setStatus("Download failed: photo not found.");
    return;
  }
  if (!photo.cloudinaryId) {
    setStatus("Download unavailable: this photo has no file stored.");
    return;
  }
  const path = photo.cloudinaryId.startsWith("/") ? photo.cloudinaryId : `/${photo.cloudinaryId}`;
  const url = `${IMAGEKIT_BASE_URL}${path}?ik-attachment=true`;
  const link = Object.assign(document.createElement("a"), {
    href: url,
    download: (photo.title || "photo") + ".jpg",
    target: "_blank"
  });
  link.click();
}

function buildInquiryLink(photo) {
  const subject = `Inquiry about ${photo.title || "a photograph"}`;
  const body = [
    `Hi ${SITE.name.split(" ")[0]},`,
    "",
    `I'm interested in \"${photo.title || "this photograph"}\"${photo.series ? ` from ${photo.series}` : ""}.`,
    "",
    "Could you share pricing or print details?",
    ""
  ].join("\n");
  return `mailto:${SITE.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function startEdit(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo || !state.ownerMode) return;
  state.reviewMode = "edit";
  state.reviewQueue = [makeDraft(photo)];
  closeOverlay("detailOverlay");
  renderReview();
  openOverlay("reviewOverlay");
  setStatus("Editing photograph.");
}

function confirmDelete(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo || !state.ownerMode) return;
  state.pendingDeleteId = id;
  state.pendingDeleteAlbum = null;
  document.getElementById("confirmTitle").textContent = "Delete this photograph?";
  document.getElementById("confirmMsg").textContent = `Delete \"${photo.title || "Untitled"}\" permanently? This cannot be undone.`;
  openOverlay("confirmOverlay");
}

function openAlbumEditor(name) {
  const isNew = !name;
  const album = state.albums.find(item => item.name === name);

  document.getElementById("albumModalLabel").textContent = isNew ? "Create collection" : "Edit collection";
  document.getElementById("albumModalTitle").textContent = isNew ? "New Collection" : name;
  document.getElementById("albumNameField").value = name || "";
  document.getElementById("albumNameField").readOnly = !isNew;
  document.getElementById("albumNameNote").textContent = isNew ? "" : "Collection name cannot be changed here.";
  document.getElementById("albumDescField").value = album?.description || "";
  document.getElementById("albumSortField").value = album?.sortOrder > 0 ? String(album.sortOrder) : "";
  document.getElementById("albumErr").textContent = "";
  document.getElementById("albumDeleteBtn").classList.toggle("hidden", isNew);

  state.editingAlbum = isNew ? null : name;
  openOverlay("albumOverlay");
  if (isNew) requestAnimationFrame(() => document.getElementById("albumNameField").focus());
}

async function saveAlbum(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = str(fd.get("name"));
  const description = str(fd.get("description"));
  const sortRaw = str(fd.get("sortOrder"));
  const sortOrder = sortRaw === "" ? 0 : Number(sortRaw);

  if (!name) {
    document.getElementById("albumErr").textContent = "Collection name is required.";
    return;
  }

  if (!state.editingAlbum && state.albums.some(album => album.name === name)) {
    document.getElementById("albumErr").textContent = "A collection with this name already exists.";
    return;
  }

  if (sortRaw !== "" && (!Number.isInteger(sortOrder) || sortOrder < 1)) {
    document.getElementById("albumErr").textContent = "Collection order must be a whole number greater than 0.";
    return;
  }

  const existing = state.albums.find(album => album.name === (state.editingAlbum || name));
  const album = {
    name: state.editingAlbum || name,
    description,
    coverCloudinaryId: existing?.coverCloudinaryId || "",
    sortOrder
  };

  try {
    await sbAlbumUpsert(album);
    closeOverlay("albumOverlay");
    const wasEditing = !!state.editingAlbum;
    state.editingAlbum = null;
    await refresh();
    setStatus(wasEditing ? "Collection updated." : "Collection saved.");
  } catch (err) {
    console.error(err);
    document.getElementById("albumErr").textContent = err.message || "Could not save collection.";
  }
}

function deleteAlbum() {
  if (!state.editingAlbum) return;
  const name = state.editingAlbum;
  const hasPhotos = state.photos.some(photo => photo.series === name);
  if (hasPhotos) {
    document.getElementById("albumErr").textContent = "This collection still has photographs. Retag or remove them before deleting the collection.";
    return;
  }

  state.pendingDeleteAlbum = name;
  state.pendingDeleteId = null;
  document.getElementById("confirmTitle").textContent = "Delete this collection?";
  document.getElementById("confirmMsg").textContent = `Delete the collection "${name}"? This cannot be undone.`;
  closeOverlay("albumOverlay");
  openOverlay("confirmOverlay");
}

async function ensureAlbumExists(name, fallbackCover = "") {
  if (!name) return;

  const existing = state.albums.find(album => album.name === name);
  if (existing) {
    if (!existing.coverCloudinaryId && fallbackCover) {
      await sbAlbumUpsert({
        name: existing.name,
        description: existing.description || "",
        coverCloudinaryId: fallbackCover,
        sortOrder: existing.sortOrder || 0
      });
    }
    return;
  }

  const album = {
    name,
    description: "",
    coverCloudinaryId: fallbackCover || "",
    sortOrder: 0
  };
  await sbAlbumUpsert(album);
}



function photoTimestamp(photo) {
  const source = photo.dateTaken || photo.uploadedAt;
  const time = new Date(source).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function formatAlbumDateSpan(group) {
  if (!group.latestTimestamp) return "Recently added";
  if (!group.earliestTimestamp || group.earliestTimestamp === group.latestTimestamp) {
    return fmtMonthYear(group.latestTimestamp);
  }
  return `${fmtMonthYear(group.earliestTimestamp)} - ${fmtMonthYear(group.latestTimestamp)}`;
}

function fmtMonthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" }).format(date);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function compact(values) {
  return values.map(str).filter(Boolean).join(" · ");
}

function uniq(values) {
  return [...new Set(values.map(str).filter(Boolean))];
}

function str(value) {
  return typeof value === "string" ? value.trim() : (value == null ? "" : String(value).trim());
}

function genId() {
  return window.crypto?.randomUUID?.() ?? (Date.now() + "-" + Math.random().toString(36).slice(2));
}

function esc(value) {
  return str(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escA(value) {
  return esc(value);
}

function fmtDateInput(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fmtDisplay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return str(value);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function fmtDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return str(value);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function fmtAperture(value) {
  if (value == null || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return str(value);
  return `f/${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1).replace(/\.0$/, "")}`;
}

function fmtShutter(value) {
  if (value == null || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return str(value);
  if (num >= 1) return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1).replace(/\.0$/, "")} sec`;
  const denominator = Math.round(1 / num);
  return denominator > 0 ? `1/${denominator} sec` : `${num.toFixed(3)} sec`;
}

function fmtFocal(value) {
  if (value == null || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return str(value);
  return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1).replace(/\.0$/, "")}mm`;
}

function titleize(name) {
  if (!name) return "Untitled";
  const source = String(name).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return source ? source.replace(/\b\w/g, match => match.toUpperCase()) : "Untitled";
}

function isPlaceholderInstagram(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "instagram.com" && (!parsed.pathname || parsed.pathname === "/");
  } catch (_) {
    return true;
  }
}

function cloudinaryUrl(filePath, transforms) {
  if (!filePath) return "";
  const path = filePath.startsWith("/") ? filePath : `/${filePath}`;
  if (!transforms) return `${IMAGEKIT_BASE_URL}${path}`;
  const ikTransforms = transforms
    .replace(/fl_attachment[^,]*/g, "")
    .replace(/c_fill,?/g, "")
    .replace(/([a-z]{1,2})_/g, "$1-")
    .replace(/^,|,$/g, "")
    .replace(/,,+/g, ",");
  return ikTransforms
    ? `${IMAGEKIT_BASE_URL}/tr:${ikTransforms}${path}`
    : `${IMAGEKIT_BASE_URL}${path}`;
}

function toRow(photo) {
  return {
    id: photo.id,
    cloudinary_id: photo.cloudinaryId || null,
    title: photo.title || "",
    description: photo.description || "",
    series: photo.series || "",
    date_taken: photo.dateTaken || "",
    location: photo.location || "",
    coordinates: photo.coordinates || "",
    camera: photo.camera || "",
    lens: photo.lens || "",
    aperture: photo.aperture || "",
    shutter_speed: photo.shutterSpeed || "",
    iso: photo.iso || "",
    focal_length: photo.focalLength || "",
    uploaded_at: photo.uploadedAt || new Date().toISOString(),
    order_timestamp: photo.orderTimestamp || Date.now(),
    starred: photo.starred || false
  };
}

function fromRow(row) {
  return {
    id: row.id,
    cloudinaryId: row.cloudinary_id,
    title: row.title,
    description: row.description,
    series: row.series,
    dateTaken: row.date_taken,
    location: row.location,
    coordinates: row.coordinates,
    camera: row.camera,
    lens: row.lens,
    aperture: row.aperture,
    shutterSpeed: row.shutter_speed,
    iso: row.iso,
    focalLength: row.focal_length,
    uploadedAt: row.uploaded_at,
    orderTimestamp: row.order_timestamp,
    starred: row.starred || false
  };
}

async function sbGetAll() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_TABLE}?select=*&order=order_timestamp.desc`, { headers: SB_HDR });
  if (!res.ok) {
    const message = await res.text();
    console.error("Supabase fetch failed", message);
    throw new Error(`Photos load failed (HTTP ${res.status})`);
  }
  return (await res.json()).map(fromRow);
}

async function sbUpsert(photo) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_TABLE}`, {
    method: "POST",
    headers: { ...SB_HDR, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(toRow(photo))
  });
  if (!res.ok) {
    const message = await res.text();
    console.error("Supabase upsert failed", message);
    throw new Error(message);
  }
}

async function sbDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: SB_HDR
  });
  if (!res.ok) {
    const message = await res.text();
    console.error("Supabase delete failed", message);
    throw new Error(message);
  }
}

async function sbToggleStar(id, starred) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...SB_HDR, "Prefer": "return=minimal" },
    body: JSON.stringify({ starred })
  });
  if (!res.ok) {
    const message = await res.text();
    console.error("Star update failed", message);
    throw new Error(message);
  }
}

function fromAlbumRow(row) {
  return {
    name: row.name,
    description: row.description || "",
    coverCloudinaryId: row.cover_cloudinary_id || "",
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at
  };
}

function toAlbumRow(album) {
  return {
    name: album.name,
    description: album.description || "",
    cover_cloudinary_id: album.coverCloudinaryId || "",
    sort_order: album.sortOrder || 0
  };
}

async function sbAlbumsGetAll() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}?select=*&order=sort_order.asc,name.asc`, { headers: SB_HDR });
  if (!res.ok) {
    const message = await res.text();
    console.error("Albums fetch failed", message);
    throw new Error(`Albums load failed (HTTP ${res.status})`);
  }
  return (await res.json()).map(fromAlbumRow);
}

async function sbAlbumUpsert(album) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}`, {
    method: "POST",
    headers: { ...SB_HDR, "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify(toAlbumRow(album))
  });
  if (!res.ok) {
    const message = await res.text();
    console.error("Album upsert failed", message);
    throw new Error(message);
  }
}

async function sbAlbumDelete(name) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}?name=eq.${encodeURIComponent(name)}`, {
    method: "DELETE",
    headers: SB_HDR
  });
  if (!res.ok) {
    const message = await res.text();
    console.error("Album delete failed", message);
    throw new Error(message);
  }
}
