// ─── EDIT THESE ──────────────────────────────────────────────────────────────
const SITE = {
  name:          "Anh Trinh",
  headline:      "Photographs made with intention.",
  heroText:      "A personal archive of selected work — landscapes, moments, and the details that make a frame worth keeping.",
  aboutHeadline: "Based in the San Francisco Bay Area.",
  aboutText:     "I photograph what catches my eye — light, place, and the quiet in-between moments. This portfolio is a running collection of work I'm proud of, organized by album and shot with whatever camera felt right.",
  location:      "San Francisco Bay Area",
  email:         "Trinhanh59@gmail.com",
  instagramUrl:  "https://instagram.com/"
};

const OWNER_PASSWORD = "change-this-password"; // ← change before publishing

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD    = "ddhxv23at";
const CLOUDINARY_PRESET   = "ml_default";
const CLOUDINARY_UPLOAD   = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;
const CLOUDINARY_BASE_URL = `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/upload`;

// ─── Supabase ─────────────────────────────────────────────────────────────────
// Required SQL (run once in Supabase SQL editor):
//
//   -- Photos table (create if it doesn't exist)
//   CREATE TABLE IF NOT EXISTS photos (
//     id text PRIMARY KEY,
//     cloudinary_id text,
//     title text DEFAULT '',
//     description text DEFAULT '',
//     series text DEFAULT '',
//     date_taken text DEFAULT '',
//     location text DEFAULT '',
//     coordinates text DEFAULT '',
//     camera text DEFAULT '',
//     lens text DEFAULT '',
//     aperture text DEFAULT '',
//     shutter_speed text DEFAULT '',
//     iso text DEFAULT '',
//     focal_length text DEFAULT '',
//     uploaded_at timestamptz DEFAULT now(),
//     order_timestamp bigint DEFAULT 0,
//     starred boolean DEFAULT false
//   );
//
//   -- Add starred column if upgrading from existing table
//   ALTER TABLE photos ADD COLUMN IF NOT EXISTS starred boolean DEFAULT false;
//
//   -- Albums table (new)
//   CREATE TABLE IF NOT EXISTS albums (
//     name text PRIMARY KEY,
//     description text DEFAULT '',
//     cover_cloudinary_id text DEFAULT '',
//     sort_order integer DEFAULT 0,
//     created_at timestamptz DEFAULT now()
//   );
//
//   -- Enable public read/write (owner auth is client-side)
//   ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public_all" ON photos FOR ALL USING (true) WITH CHECK (true);
//   ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public_all" ON albums FOR ALL USING (true) WITH CHECK (true);

const SUPABASE_URL      = "https://beanpxolozlggbwdoqjl.supabase.co";
const SUPABASE_KEY      = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYW5weG9sb3psZ2did2RvcWpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3Mjk5ODgsImV4cCI6MjA5MDMwNTk4OH0.isvxqR-lIk8nchcGdBBXq9OQ2COIyr4AnDO6hOxzLHc";
const SB_TABLE          = "photos";
const SB_ALBUMS_TABLE   = "albums";
const SB_HDR            = { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` };

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  ownerMode:       sessionStorage.getItem("ownerMode") === "1",
  photos:          [],
  albums:          [],
  activeAlbum:     "all",   // "all", "starred", or album name
  searchQ:         "",
  sortOrder:       "newest",
  activeId:        null,
  reviewMode:      "create",
  reviewQueue:     [],
  reviewUrls:      [],
  pendingDeleteId: null,
  editingAlbum:    null     // name of album being edited, or null for new
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  initScrollReveal();
  initNavScroll();
  bindEvents();
  syncOwnerUI();
  await refresh();
});

// ─── Scroll reveal ────────────────────────────────────────────────────────────
function initScrollReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal, .reveal-fast, .stagger").forEach(el => io.observe(el));
}

function initNavScroll() {
  const nav = document.getElementById("mainNav");
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  }, { passive: true });
}

// ─── Events ───────────────────────────────────────────────────────────────────
function bindEvents() {
  // Owner login / sign out
  document.getElementById("ownerBtn").addEventListener("click", () => {
    if (state.ownerMode) signOut();
    else { openOverlay("loginOverlay"); requestAnimationFrame(() => document.getElementById("pwField").focus()); }
  });
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("signOutBtn").addEventListener("click", signOut);

  // File upload (library picker)
  document.getElementById("uploadInput").addEventListener("change", e => {
    const files = Array.from(e.target.files || []).filter(isImageFile);
    e.target.value = "";
    if (files.length) processFiles(files);
  });

  // Camera capture (direct camera, great for iPhone)
  document.getElementById("cameraInput").addEventListener("change", e => {
    const files = Array.from(e.target.files || []).filter(isImageFile);
    e.target.value = "";
    if (files.length) processFiles(files);
  });

  document.getElementById("heroUploadBtn").addEventListener("click", () =>
    document.getElementById("uploadInput").click()
  );

  // Review modal
  document.getElementById("reviewCancelBtn").addEventListener("click", closeReview);
  document.getElementById("reviewSaveBtn").addEventListener("click", saveReview);

  // Detail navigation
  document.getElementById("prevBtn").addEventListener("click", () => navDetail(-1));
  document.getElementById("nextBtn").addEventListener("click", () => navDetail(1));

  // Confirm delete
  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    const id = state.pendingDeleteId;
    state.pendingDeleteId = null;
    closeOverlay("confirmOverlay");
    await sbDelete(id);
    closeOverlay("detailOverlay");
    await refresh();
    setStatus("Deleted.");
  });

  // Search + sort
  document.getElementById("searchInput").addEventListener("input", e => {
    state.searchQ = e.target.value.trim().toLowerCase();
    renderGallery();
  });
  document.getElementById("sortSel").addEventListener("change", e => {
    state.sortOrder = e.target.value;
    sortPhotos();
    renderGallery();
  });

  // Drag and drop
  const dz = document.getElementById("dropZone");
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("over");
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    if (files.length) processFiles(files);
  });
  const gallery = document.getElementById("gallery");
  gallery.addEventListener("dragover", e => { if (state.ownerMode) { e.preventDefault(); dz.classList.add("over"); } });
  gallery.addEventListener("dragleave", e => { if (!e.currentTarget.contains(e.relatedTarget)) dz.classList.remove("over"); });
  gallery.addEventListener("drop", e => {
    if (!state.ownerMode) return;
    e.preventDefault(); dz.classList.remove("over");
    const files = Array.from(e.dataTransfer.files).filter(isImageFile);
    if (files.length) processFiles(files);
  });

  // Album management
  document.getElementById("newAlbumBtn").addEventListener("click", () => openAlbumEditor(null));
  document.getElementById("albumForm").addEventListener("submit", saveAlbum);
  document.getElementById("albumDeleteBtn").addEventListener("click", deleteAlbum);

  // Delegated clicks
  document.addEventListener("click", e => {
    // Close overlays via [data-close]
    const closer = e.target.closest("[data-close]");
    if (closer) {
      closeOverlay(closer.dataset.close);
      if (closer.dataset.close === "reviewOverlay") closeReview();
      return;
    }
    // Backdrop click
    if (e.target.classList.contains("modal-overlay")) {
      const id = e.target.id;
      if (id === "reviewOverlay") closeReview(); else closeOverlay(id);
      return;
    }
    // Album tile edit button
    const ae = e.target.closest("[data-album-edit]");
    if (ae) {
      e.stopPropagation();
      openAlbumEditor(ae.dataset.albumEdit);
      return;
    }
    // Photo brick click → detail
    const brick = e.target.closest("[data-photo-id]");
    if (brick && !e.target.closest("[data-action]")) {
      openDetail(brick.dataset.photoId);
      return;
    }
    // Detail / photo actions
    const act = e.target.closest("[data-action]");
    if (act) {
      const { action, photoId } = act.dataset;
      if (action === "edit")     startEdit(photoId);
      if (action === "delete")   confirmDelete(photoId);
      if (action === "download") downloadPhoto(photoId);
      if (action === "star")     toggleStar(photoId);
      if (action === "close")    closeOverlay("detailOverlay");
      return;
    }
    // Album filter chip
    const sf = e.target.closest("[data-series]");
    if (sf) {
      state.activeAlbum = sf.dataset.series;
      state.searchQ = "";
      document.getElementById("searchInput").value = "";
      renderFilters(); renderGallery();
      return;
    }
    // Starred filter chip
    const stf = e.target.closest("[data-starred-filter]");
    if (stf) {
      state.activeAlbum = state.activeAlbum === "starred" ? "all" : "starred";
      state.searchQ = "";
      document.getElementById("searchInput").value = "";
      renderFilters(); renderGallery();
      return;
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (document.getElementById("reviewOverlay").classList.contains("open"))  { closeReview(); return; }
      if (document.getElementById("confirmOverlay").classList.contains("open")) { closeOverlay("confirmOverlay"); return; }
      if (document.getElementById("detailOverlay").classList.contains("open"))  { closeOverlay("detailOverlay"); return; }
      if (document.getElementById("albumOverlay").classList.contains("open"))   { closeOverlay("albumOverlay"); return; }
      if (document.getElementById("loginOverlay").classList.contains("open"))   { closeOverlay("loginOverlay"); return; }
    }
    if (document.getElementById("detailOverlay").classList.contains("open")) {
      if (e.key === "ArrowLeft")  navDetail(-1);
      if (e.key === "ArrowRight") navDetail(1);
    }
  });
}

// ─── Overlays ─────────────────────────────────────────────────────────────────
const OVERLAYS = ["loginOverlay", "reviewOverlay", "detailOverlay", "confirmOverlay", "albumOverlay"];

function openOverlay(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("open");
  const anyOpen = OVERLAYS.some(i => document.getElementById(i).classList.contains("open"));
  if (!anyOpen) document.body.style.overflow = "";
}

// ─── Owner mode ───────────────────────────────────────────────────────────────
function syncOwnerUI() {
  document.getElementById("ownerBar").classList.toggle("visible", state.ownerMode);
  document.getElementById("heroUploadBtn").classList.toggle("hidden", !state.ownerMode);
  document.getElementById("dropZone").classList.toggle("visible", state.ownerMode);
  document.getElementById("newAlbumBtn").classList.toggle("hidden", !state.ownerMode);
  const btn = document.getElementById("ownerBtn");
  btn.innerHTML = state.ownerMode ? `<span class="owner-dot"></span>Sign out` : "Owner Login";
}

function handleLogin(e) {
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
  // Re-render to show owner controls on existing photos
  renderSeries();
  renderGallery();
}

function signOut() {
  state.ownerMode = false;
  sessionStorage.removeItem("ownerMode");
  syncOwnerUI();
  closeOverlay("reviewOverlay");
  closeOverlay("detailOverlay");
  renderSeries();
  renderGallery();
}

function setStatus(msg) { document.getElementById("statusTxt").textContent = msg; }
function setProgress(pct) {
  const bar = document.getElementById("uploadProgress");
  const fill = document.getElementById("progressFill");
  if (pct >= 100) { bar.classList.remove("visible"); fill.style.width = "0%"; }
  else { bar.classList.add("visible"); fill.style.width = pct + "%"; }
}

// ─── Upload ───────────────────────────────────────────────────────────────────
function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
}

async function processFiles(files) {
  setStatus(`Reading ${files.length} file${files.length === 1 ? "" : "s"}…`);
  setProgress(10);
  const drafts = [];
  for (let i = 0; i < files.length; i++) {
    drafts.push(await makeDraft(files[i]));
    setProgress(10 + Math.round((i + 1) / files.length * 80));
  }
  setProgress(100);
  state.reviewMode  = "create";
  state.reviewQueue = drafts;
  renderReview();
  openOverlay("reviewOverlay");
  setStatus(`Reviewing ${files.length} photo${files.length === 1 ? "" : "s"}.`);
}

async function makeDraft(file) {
  const previewUrl = URL.createObjectURL(file);
  state.reviewUrls.push(previewUrl);
  let exif = {}, gps;
  try {
    exif = await window.exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "LensModel",
             "FNumber", "ExposureTime", "ISO", "FocalLength"]
    }) || {};
  } catch (_) {}
  try { gps = await window.exifr.gps(file); } catch (_) {}
  const lat = gps && typeof gps.latitude  === "number" ? gps.latitude.toFixed(5)  : "";
  const lon = gps && typeof gps.longitude === "number" ? gps.longitude.toFixed(5) : "";
  const inferredDate = fmtDateInput(exif.DateTimeOriginal || exif.CreateDate);
  return {
    draftId:        genId(),
    existing:       false,
    id:             genId(),
    file,
    previewUrl,
    cloudinaryId:   null,
    title:          titleize(file.name),
    description:    "",
    series:         "",
    dateTaken:      inferredDate,
    location:       lat && lon ? `${lat}, ${lon}` : "",
    coordinates:    lat && lon ? `${lat}, ${lon}` : "",
    camera:         compact([exif.Make, exif.Model]),
    lens:           str(exif.LensModel),
    aperture:       fmtAperture(exif.FNumber),
    shutterSpeed:   fmtShutter(exif.ExposureTime),
    iso:            exif.ISO ? String(exif.ISO) : "",
    focalLength:    fmtFocal(exif.FocalLength),
    uploadedAt:     new Date().toISOString(),
    orderTimestamp: inferredDate ? new Date(inferredDate).getTime() : Date.now(),
    starred:        false
  };
}

// ─── Review modal ─────────────────────────────────────────────────────────────
function renderReview() {
  const editing = state.reviewMode === "edit";
  document.getElementById("reviewLabel").textContent   = editing ? "Edit photograph" : "Review upload";
  document.getElementById("reviewTitle").textContent   = editing ? "Adjust details before saving" : "Check extracted metadata";
  document.getElementById("reviewSaveBtn").textContent = editing ? "Update photograph" : "Save to portfolio";

  document.getElementById("reviewList").innerHTML = state.reviewQueue.map(d => {
    const missing = getMissing(d);
    const badge = missing.length
      ? `<span class="meta-badge warn">Missing: ${esc(missing.join(", "))}</span>`
      : `<span class="meta-badge ok">✓ Metadata complete</span>`;
    return `
      <div class="review-item">
        <div class="review-preview"><img src="${escA(d.previewUrl)}" alt="" /></div>
        <form class="review-form" data-draft-id="${escA(d.draftId)}">
          ${badge}
          <div class="f-row">
            <div class="field"><label>Title</label><input name="title" type="text" value="${escA(d.title)}" placeholder="Untitled"/></div>
            <div class="field"><label>Album</label><input name="series" type="text" value="${escA(d.series)}" placeholder="e.g. Quiet Coast"/></div>
          </div>
          <div class="field"><label>Description</label><textarea name="description" placeholder="Optional caption">${esc(d.description)}</textarea></div>
          <div class="f-row">
            <div class="field"><label>Date taken</label><input name="dateTaken" type="date" value="${escA(d.dateTaken)}"/></div>
            <div class="field"><label>Location</label><input name="location" type="text" value="${escA(d.location)}" placeholder="City or region"/></div>
          </div>
          <div class="f-row">
            <div class="field"><label>Camera</label><input name="camera" type="text" value="${escA(d.camera)}" placeholder="Leica Q2…"/></div>
            <div class="field"><label>Lens</label><input name="lens" type="text" value="${escA(d.lens)}" placeholder="Optional"/></div>
          </div>
          <div class="f-row three">
            <div class="field"><label>Aperture</label><input name="aperture" type="text" value="${escA(d.aperture)}" placeholder="f/2.8"/></div>
            <div class="field"><label>Shutter</label><input name="shutterSpeed" type="text" value="${escA(d.shutterSpeed)}" placeholder="1/250 sec"/></div>
            <div class="field"><label>ISO</label><input name="iso" type="text" value="${escA(d.iso)}" placeholder="400"/></div>
          </div>
          <div class="f-row">
            <div class="field"><label>Focal length</label><input name="focalLength" type="text" value="${escA(d.focalLength)}" placeholder="35mm"/></div>
            <div class="field"><label>Coordinates</label><input name="coordinates" type="text" value="${escA(d.coordinates)}" placeholder="GPS (optional)"/></div>
          </div>
          <label class="featured-toggle">
            <input type="checkbox" name="starred" ${d.starred ? "checked" : ""} />
            <span class="featured-toggle-label">★ Mark as featured</span>
          </label>
        </form>
      </div>`;
  }).join("");
}

async function saveReview() {
  const forms = Array.from(document.getElementById("reviewList").querySelectorAll(".review-form"));
  if (!forms.length) return;
  const editing = state.reviewMode === "edit";
  setStatus(editing ? "Updating…" : "Uploading to Cloudinary…");
  setProgress(5);

  for (let i = 0; i < forms.length; i++) {
    const f  = forms[i];
    const d  = state.reviewQueue.find(x => x.draftId === f.dataset.draftId);
    const fd = new FormData(f);
    const dt = str(fd.get("dateTaken"));

    const record = {
      id:             d.id,
      cloudinaryId:   d.cloudinaryId || null,
      uploadedAt:     d.uploadedAt || new Date().toISOString(),
      orderTimestamp: dt ? new Date(dt).getTime() : d.orderTimestamp || Date.now(),
      title:          str(fd.get("title")) || "Untitled",
      series:         str(fd.get("series")),
      description:    str(fd.get("description")),
      dateTaken:      dt,
      location:       str(fd.get("location")),
      coordinates:    str(fd.get("coordinates")),
      camera:         str(fd.get("camera")),
      lens:           str(fd.get("lens")),
      aperture:       str(fd.get("aperture")),
      shutterSpeed:   str(fd.get("shutterSpeed")),
      iso:            str(fd.get("iso")),
      focalLength:    str(fd.get("focalLength")),
      starred:        fd.get("starred") === "on"
    };

    // Upload to Cloudinary for new photos
    if (!editing && d.file) {
      try {
        setStatus(`Uploading ${i + 1} of ${forms.length} to Cloudinary…`);
        const cldForm = new FormData();
        cldForm.append("file", d.file);
        cldForm.append("upload_preset", CLOUDINARY_PRESET);
        cldForm.append("public_id", record.id);
        const res  = await fetch(CLOUDINARY_UPLOAD, { method: "POST", body: cldForm });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        record.cloudinaryId = data.public_id;
      } catch (err) {
        setStatus(`Upload failed: ${err.message}`);
        setProgress(100);
        return;
      }
    }

    await sbUpsert(record);
    setProgress(5 + Math.round((i + 1) / forms.length * 93));
  }

  setProgress(100);
  closeReview();
  await refresh();
  setStatus(editing ? "Updated." : `${forms.length} photo${forms.length === 1 ? "" : "s"} saved.`);
}

function closeReview() {
  state.reviewUrls.forEach(u => URL.revokeObjectURL(u));
  state.reviewUrls  = [];
  state.reviewQueue = [];
  state.reviewMode  = "create";
  closeOverlay("reviewOverlay");
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
async function refresh() {
  [state.photos, state.albums] = await Promise.all([sbGetAll(), sbAlbumsGetAll()]);
  sortPhotos();
  const seriesNames = uniq(state.photos.map(p => p.series));
  const albumNames  = state.albums.map(a => a.name);
  const allNames    = new Set([...seriesNames, ...albumNames]);
  if (state.activeAlbum !== "all" && state.activeAlbum !== "starred" && !allNames.has(state.activeAlbum)) {
    state.activeAlbum = "all";
  }
  renderStats();
  renderSeries();
  renderTax();
  renderFilters();
  renderGallery();
  initScrollReveal();
}

function sortPhotos() {
  if (state.sortOrder === "newest")      state.photos.sort((a, b) => (b.orderTimestamp || 0) - (a.orderTimestamp || 0));
  else if (state.sortOrder === "oldest") state.photos.sort((a, b) => (a.orderTimestamp || 0) - (b.orderTimestamp || 0));
  else if (state.sortOrder === "title")  state.photos.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

function filtered() {
  let p = state.photos;
  if (state.activeAlbum === "starred") {
    p = p.filter(x => x.starred);
  } else if (state.activeAlbum !== "all") {
    p = p.filter(x => x.series === state.activeAlbum);
  }
  if (state.searchQ) {
    const q = state.searchQ;
    p = p.filter(x => [x.title, x.series, x.camera, x.location, x.description]
      .some(v => (v || "").toLowerCase().includes(q)));
  }
  return p;
}

// ─── Render stats ─────────────────────────────────────────────────────────────
function renderStats() {
  const albumCount = new Set([
    ...uniq(state.photos.map(p => p.series)),
    ...state.albums.map(a => a.name)
  ]).size;
  document.getElementById("statPhotos").textContent  = state.photos.length;
  document.getElementById("statAlbums").textContent  = albumCount;
  document.getElementById("statCameras").textContent = uniq(state.photos.map(p => p.camera)).length;
}

// ─── Render albums/series ─────────────────────────────────────────────────────
function renderSeries() {
  const photoGroups = groupSeries(state.photos);

  // Merge albums table + series from photos
  const allNames = [...new Set([
    ...state.albums.map(a => a.name),
    ...photoGroups.map(g => g.name)
  ])];

  const groups = allNames.map(name => {
    const pg    = photoGroups.find(g => g.name === name) || { name, count: 0, latestDate: "" };
    const meta  = state.albums.find(a => a.name === name);
    const cover = meta?.coverCloudinaryId ||
                  state.photos.find(p => p.series === name && p.cloudinaryId)?.cloudinaryId || "";
    return {
      name,
      count:       pg.count,
      latestDate:  pg.latestDate || "",
      description: meta?.description || "",
      cover
    };
  })
  .filter(g => g.count > 0 || state.albums.some(a => a.name === g.name))
  .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  .slice(0, 9);

  const wrap = document.getElementById("seriesWrap");

  if (!groups.length) {
    wrap.innerHTML = `<div style="border:1px dashed var(--line);border-radius:12px;padding:32px;color:var(--muted);font-size:0.88rem;">
      Albums appear after uploading photos with an album tag${state.ownerMode ? ', or click <strong>+ New Album</strong> above.' : '.'}
    </div>`;
    wrap.className = "stagger";
    return;
  }

  wrap.innerHTML = `<div class="series-grid">${groups.map(g => {
    const bgLayer = g.cover
      ? `<div class="series-tile-bg" style="background-image:url('${cloudinaryUrl(g.cover, "w_600,q_auto,f_auto,c_fill,h_400")}')"></div>
         <div class="series-tile-cover-overlay"></div>`
      : "";
    const editBtn = state.ownerMode
      ? `<button type="button" class="btn-quiet album-edit-btn" data-album-edit="${escA(g.name)}">Edit</button>`
      : "";
    return `
      <div class="series-tile reveal" data-series="${escA(g.name)}">
        ${bgLayer}
        ${editBtn}
        <div class="series-tile-content">
          <div class="series-tile-count">${g.count} photograph${g.count === 1 ? "" : "s"}</div>
          <div class="series-tile-name">${esc(g.name)}</div>
          ${g.description ? `<div class="series-tile-desc">${esc(g.description)}</div>` : ""}
          <div class="series-tile-date">${esc(g.latestDate || "Recently added")}</div>
        </div>
      </div>`;
  }).join("")}</div>`;
  wrap.className = "";
}

// ─── Render taxonomy ──────────────────────────────────────────────────────────
function renderTax() {
  const tpl = (vals, empty) => vals.length
    ? vals.slice(0, 8).map(v => `<span class="tax-pill">${esc(v)}</span>`).join("")
    : `<span class="tax-pill" style="color:var(--muted2);">${empty}</span>`;
  document.getElementById("seriesTax").innerHTML = tpl(uniq(state.photos.map(p => p.series)), "After upload");
  document.getElementById("cameraTax").innerHTML = tpl(uniq(state.photos.map(p => p.camera)), "From EXIF");
  document.getElementById("lensTax").innerHTML   = tpl(uniq(state.photos.map(p => p.lens)),   "When available");
}

// ─── Render filters ───────────────────────────────────────────────────────────
function renderFilters() {
  const albums  = uniq(state.photos.map(p => p.series));
  const isStarred = state.activeAlbum === "starred";
  const starredCount = state.photos.filter(p => p.starred).length;

  const albumChips = [{v: "all", l: "All"}, ...albums.map(n => ({v: n, l: n}))].map(f => {
    const active = !isStarred && state.activeAlbum === f.v;
    return `<button type="button" class="chip ${active ? "active" : ""}" data-series="${escA(f.v)}">${esc(f.l)}</button>`;
  }).join("");

  const starChip = starredCount > 0
    ? `<button type="button" class="chip starred-chip ${isStarred ? "active" : ""}" data-starred-filter="1">★ Featured (${starredCount})</button>`
    : "";

  document.getElementById("filterPills").innerHTML = albumChips + starChip;
}

// ─── Render gallery ───────────────────────────────────────────────────────────
function renderGallery() {
  const photos = filtered();
  const wrap   = document.getElementById("galleryWrap");

  if (!photos.length) {
    const noPhotos = state.photos.length === 0;
    wrap.innerHTML = `
      <div class="empty">
        <h3>${noPhotos ? "No photographs yet." : "No results."}</h3>
        <p>${noPhotos ? "Log in as owner to start uploading." : "Try a different filter or clear the search."}</p>
        <div class="empty-actions">${emptyActions(noPhotos)}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `<div class="photo-grid">${photos.map(p => {
    const src       = cloudinaryUrl(p.cloudinaryId, "w_800,q_auto,f_auto");
    const starBadge = p.starred ? `<div class="photo-star-badge">★</div>` : "";
    return `
      <div class="photo-brick reveal-fast" data-photo-id="${escA(p.id)}">
        <img src="${escA(src)}" alt="${escA(p.title || "Photograph")}" loading="lazy" />
        ${starBadge}
        <div class="photo-brick-overlay">
          <div class="photo-brick-title">${esc(p.title || "Untitled")}</div>
          <div class="photo-brick-meta">${esc(compact([p.series, p.location]) || p.camera || "")}</div>
        </div>
      </div>`;
  }).join("")}</div>`;

  initScrollReveal();
}

function emptyActions(noPhotos) {
  if (noPhotos && state.ownerMode)
    return `<button class="btn" onclick="document.getElementById('uploadInput').click()">Upload photographs</button>`;
  if (noPhotos)
    return `<button class="btn-ghost" onclick="document.getElementById('ownerBtn').click()">Owner login</button>`;
  return `<button class="btn-quiet" onclick="
    document.getElementById('searchInput').value='';
    state.searchQ=''; state.activeAlbum='all';
    renderFilters(); renderGallery();">Clear filter</button>`;
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function openDetail(id) {
  const photo = state.photos.find(p => p.id === id);
  if (!photo) return;
  state.activeId = id;
  renderDetail(photo);
  openOverlay("detailOverlay");
}

function renderDetail(photo) {
  const photos = filtered();
  const idx    = photos.findIndex(p => p.id === photo.id);

  document.getElementById("detailCounter").textContent = photos.length > 1 ? `${idx + 1} of ${photos.length}` : "Photograph";
  document.getElementById("detailTitle").textContent   = photo.title || "Untitled";
  document.getElementById("detailDesc").textContent    = photo.description || "No description.";

  const img = document.getElementById("detailImg");
  img.style.opacity = "0";
  img.onload = () => { img.style.opacity = "1"; };
  img.src = cloudinaryUrl(photo.cloudinaryId, "w_2000,q_auto,f_auto");

  // Tags
  document.getElementById("detailTags").innerHTML = [
    photo.starred && `<span class="tag featured-tag">★ Featured</span>`,
    photo.series  && `<span class="tag">Album · ${esc(photo.series)}</span>`,
    photo.camera  && `<span class="tag">${esc(photo.camera)}</span>`,
    photo.lens    && `<span class="tag">${esc(photo.lens)}</span>`
  ].filter(Boolean).join("");

  // Metadata grid
  const meta = [
    ["Date",         fmtDisplay(photo.dateTaken) || "—"],
    ["Location",     photo.location     || "—"],
    ["Camera",       photo.camera       || "—"],
    ["Lens",         photo.lens         || "—"],
    ["Aperture",     photo.aperture     || "—"],
    ["Shutter",      photo.shutterSpeed || "—"],
    ["ISO",          photo.iso          || "—"],
    ["Focal length", photo.focalLength  || "—"],
    ["Coordinates",  photo.coordinates  || "—"],
    ["Added",        fmtDateTime(photo.uploadedAt) || "—"]
  ];
  document.getElementById("detailMeta").innerHTML = meta.map(([k, v]) => `
    <div class="meta-cell"><div class="meta-k">${esc(k)}</div><div class="meta-v">${esc(v)}</div></div>`).join("");

  // Navigation buttons
  document.getElementById("prevBtn").disabled = idx <= 0;
  document.getElementById("nextBtn").disabled = idx >= photos.length - 1;

  // Action buttons
  if (state.ownerMode) {
    const starred = photo.starred;
    document.getElementById("detailActions").innerHTML = `
      <button class="star-toggle-btn ${starred ? "starred" : ""}" data-action="star" data-photo-id="${escA(photo.id)}" title="${starred ? "Unfeature" : "Mark as featured"}">
        ${starred ? "★" : "☆"}
      </button>
      <button class="btn-ghost"  data-action="edit"     data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Edit</button>
      <button class="btn-quiet"  data-action="download" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Download</button>
      <button class="btn-danger" data-action="delete"   data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;border-radius:999px;border:1px solid rgba(224,112,112,0.35);color:var(--danger);cursor:pointer;background:transparent;">Delete</button>
      <button class="btn-quiet"  data-action="close"    style="font-size:0.78rem;min-height:36px;padding:7px 16px;margin-left:auto;">Close</button>`;
  } else {
    document.getElementById("detailActions").innerHTML = `
      <button class="btn-quiet" data-action="download" data-photo-id="${escA(photo.id)}" style="font-size:0.78rem;min-height:36px;padding:7px 16px;">Download</button>
      <button class="btn-quiet" data-action="close"    style="font-size:0.78rem;min-height:36px;padding:7px 16px;margin-left:auto;">Close</button>`;
  }
}

function navDetail(dir) {
  const photos = filtered();
  const idx    = photos.findIndex(p => p.id === state.activeId);
  const next   = photos[idx + dir];
  if (!next) return;
  state.activeId = next.id;
  renderDetail(next);
}

// ─── Star / Feature ───────────────────────────────────────────────────────────
async function toggleStar(id) {
  const p = state.photos.find(x => x.id === id);
  if (!p || !state.ownerMode) return;
  p.starred = !p.starred;
  renderDetail(p);
  renderGallery();
  renderFilters();
  await sbToggleStar(id, p.starred);
  setStatus(p.starred ? "Marked as featured." : "Removed from featured.");
}

// ─── Download / Edit / Delete ─────────────────────────────────────────────────
function downloadPhoto(id) {
  const p = state.photos.find(x => x.id === id);
  if (!p?.cloudinaryId) return;
  const url = cloudinaryUrl(p.cloudinaryId, "fl_attachment,q_auto");
  const a   = Object.assign(document.createElement("a"), {
    href: url, download: (p.title || "photo") + ".jpg", target: "_blank"
  });
  a.click();
}

function startEdit(id) {
  const p = state.photos.find(x => x.id === id);
  if (!p || !state.ownerMode) return;
  state.reviewMode  = "edit";
  state.reviewQueue = [{
    draftId:        genId(),
    existing:       true,
    id:             p.id,
    file:           null,
    previewUrl:     cloudinaryUrl(p.cloudinaryId, "w_600,q_auto,f_auto"),
    cloudinaryId:   p.cloudinaryId,
    title:          p.title          || "",
    description:    p.description    || "",
    series:         p.series         || "",
    dateTaken:      p.dateTaken      || "",
    location:       p.location       || "",
    coordinates:    p.coordinates    || "",
    camera:         p.camera         || "",
    lens:           p.lens           || "",
    aperture:       p.aperture       || "",
    shutterSpeed:   p.shutterSpeed   || "",
    iso:            p.iso            || "",
    focalLength:    p.focalLength    || "",
    uploadedAt:     p.uploadedAt     || new Date().toISOString(),
    orderTimestamp: p.orderTimestamp || Date.now(),
    starred:        p.starred        || false
  }];
  closeOverlay("detailOverlay");
  renderReview();
  openOverlay("reviewOverlay");
  setStatus("Editing photo.");
}

function confirmDelete(id) {
  const p = state.photos.find(x => x.id === id);
  if (!p || !state.ownerMode) return;
  state.pendingDeleteId = id;
  document.getElementById("confirmMsg").textContent =
    `Delete "${p.title || "Untitled"}" permanently? This cannot be undone.`;
  openOverlay("confirmOverlay");
}

// ─── Album management ─────────────────────────────────────────────────────────
function openAlbumEditor(name) {
  const isNew = !name;
  const album = state.albums.find(a => a.name === name);

  document.getElementById("albumModalLabel").textContent = isNew ? "Create album" : "Edit album";
  document.getElementById("albumModalTitle").textContent = isNew ? "New Album" : name;
  document.getElementById("albumNameField").value        = name || "";
  document.getElementById("albumNameField").readOnly     = !isNew;
  document.getElementById("albumNameNote").textContent   = isNew ? "" : "Album name cannot be changed.";
  document.getElementById("albumDescField").value        = album?.description || "";
  document.getElementById("albumErr").textContent        = "";
  document.getElementById("albumDeleteBtn").classList.toggle("hidden", isNew);

  state.editingAlbum = isNew ? null : name;
  openOverlay("albumOverlay");
  if (isNew) requestAnimationFrame(() => document.getElementById("albumNameField").focus());
}

async function saveAlbum(e) {
  e.preventDefault();
  const fd   = new FormData(e.target);
  const name = str(fd.get("name"));
  const desc = str(fd.get("description"));

  if (!name) {
    document.getElementById("albumErr").textContent = "Album name is required.";
    return;
  }

  // For new albums, check for duplicate name
  if (!state.editingAlbum && state.albums.some(a => a.name === name)) {
    document.getElementById("albumErr").textContent = "An album with this name already exists.";
    return;
  }

  const existing = state.albums.find(a => a.name === (state.editingAlbum || name));
  const album = {
    name:              state.editingAlbum || name,
    description:       desc,
    coverCloudinaryId: existing?.coverCloudinaryId || "",
    sortOrder:         existing?.sortOrder || 0
  };

  await sbAlbumUpsert(album);
  closeOverlay("albumOverlay");
  state.editingAlbum = null;
  await refresh();
  setStatus(state.editingAlbum ? "Album updated." : "Album saved.");
}

async function deleteAlbum() {
  if (!state.editingAlbum) return;
  const name = state.editingAlbum;
  await sbAlbumDelete(name);
  closeOverlay("albumOverlay");
  state.editingAlbum = null;
  await refresh();
  setStatus("Album deleted.");
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function getMissing(d) {
  const m = [];
  if (!d.dateTaken)    m.push("date");
  if (!d.location)     m.push("location");
  if (!d.camera)       m.push("camera");
  if (!d.aperture)     m.push("aperture");
  if (!d.shutterSpeed) m.push("shutter");
  return m;
}

function groupSeries(photos) {
  const map = new Map();
  photos.forEach(p => {
    if (!p.series) return;
    const e = map.get(p.series) || { name: p.series, count: 0, latestDate: "" };
    e.count++;
    if (!e.latestDate) e.latestDate = fmtDisplay(p.dateTaken) || fmtDisplay(p.uploadedAt);
    map.set(p.series, e);
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function compact(vals) { return vals.map(str).filter(Boolean).join(" · "); }
function uniq(vals)    { return [...new Set(vals.map(str).filter(Boolean))]; }
function str(v)        { return typeof v === "string" ? v.trim() : (v == null ? "" : String(v).trim()); }
function genId()       { return window.crypto?.randomUUID?.() ?? (Date.now() + "-" + Math.random().toString(36).slice(2)); }

function esc(v) {
  return str(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escA(v) { return esc(v); }

function fmtDateInput(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtDisplay(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return str(v);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(d);
}
function fmtDateTime(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return str(v);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}
function fmtAperture(v)  { if (v == null || v === "") return ""; const n = Number(v); if (!isFinite(n)) return str(v); return `f/${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "")}`; }
function fmtShutter(v)   { if (v == null || v === "") return ""; const n = Number(v); if (!isFinite(n)) return str(v); if (n >= 1) return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "")} sec`; const d = Math.round(1 / n); return d > 0 ? `1/${d} sec` : `${n.toFixed(3)} sec`; }
function fmtFocal(v)     { if (v == null || v === "") return ""; const n = Number(v); if (!isFinite(n)) return str(v); return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, "")}mm`; }
function titleize(name)  { const s = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim(); return s ? s.replace(/\b\w/g, m => m.toUpperCase()) : "Untitled"; }

// ─── Cloudinary URL helper ────────────────────────────────────────────────────
function cloudinaryUrl(publicId, transforms) {
  if (!publicId) return "";
  return `${CLOUDINARY_BASE_URL}/${transforms}/${publicId}`;
}

// ─── Supabase: photos ─────────────────────────────────────────────────────────
function toRow(p) {
  return {
    id:              p.id,
    cloudinary_id:   p.cloudinaryId    || null,
    title:           p.title           || "",
    description:     p.description     || "",
    series:          p.series          || "",
    date_taken:      p.dateTaken       || "",
    location:        p.location        || "",
    coordinates:     p.coordinates     || "",
    camera:          p.camera          || "",
    lens:            p.lens            || "",
    aperture:        p.aperture        || "",
    shutter_speed:   p.shutterSpeed    || "",
    iso:             p.iso             || "",
    focal_length:    p.focalLength     || "",
    uploaded_at:     p.uploadedAt      || new Date().toISOString(),
    order_timestamp: p.orderTimestamp  || Date.now(),
    starred:         p.starred         || false
  };
}

function fromRow(r) {
  return {
    id:             r.id,
    cloudinaryId:   r.cloudinary_id,
    title:          r.title,
    description:    r.description,
    series:         r.series,
    dateTaken:      r.date_taken,
    location:       r.location,
    coordinates:    r.coordinates,
    camera:         r.camera,
    lens:           r.lens,
    aperture:       r.aperture,
    shutterSpeed:   r.shutter_speed,
    iso:            r.iso,
    focalLength:    r.focal_length,
    uploadedAt:     r.uploaded_at,
    orderTimestamp: r.order_timestamp,
    starred:        r.starred || false
  };
}

async function sbGetAll() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_TABLE}?select=*&order=order_timestamp.desc`,
    { headers: SB_HDR }
  );
  if (!res.ok) { console.error("Supabase fetch failed", await res.text()); return []; }
  return (await res.json()).map(fromRow);
}

async function sbUpsert(photo) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_TABLE}`,
    {
      method:  "POST",
      headers: { ...SB_HDR, "Prefer": "resolution=merge-duplicates" },
      body:    JSON.stringify(toRow(photo))
    }
  );
  if (!res.ok) console.error("Supabase upsert failed", await res.text());
}

async function sbDelete(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_TABLE}?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: SB_HDR }
  );
  if (!res.ok) console.error("Supabase delete failed", await res.text());
}

async function sbToggleStar(id, starred) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_TABLE}?id=eq.${encodeURIComponent(id)}`,
    {
      method:  "PATCH",
      headers: { ...SB_HDR, "Prefer": "return=minimal" },
      body:    JSON.stringify({ starred })
    }
  );
  if (!res.ok) console.error("Star update failed", await res.text());
}

// ─── Supabase: albums ─────────────────────────────────────────────────────────
function fromAlbumRow(r) {
  return {
    name:              r.name,
    description:       r.description        || "",
    coverCloudinaryId: r.cover_cloudinary_id || "",
    sortOrder:         r.sort_order         || 0,
    createdAt:         r.created_at
  };
}

function toAlbumRow(a) {
  return {
    name:               a.name,
    description:        a.description        || "",
    cover_cloudinary_id: a.coverCloudinaryId || "",
    sort_order:         a.sortOrder          || 0
  };
}

async function sbAlbumsGetAll() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}?select=*&order=sort_order.asc,name.asc`,
    { headers: SB_HDR }
  );
  if (!res.ok) { console.error("Albums fetch failed", await res.text()); return []; }
  return (await res.json()).map(fromAlbumRow);
}

async function sbAlbumUpsert(album) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}`,
    {
      method:  "POST",
      headers: { ...SB_HDR, "Prefer": "resolution=merge-duplicates" },
      body:    JSON.stringify(toAlbumRow(album))
    }
  );
  if (!res.ok) console.error("Album upsert failed", await res.text());
}

async function sbAlbumDelete(name) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${SB_ALBUMS_TABLE}?name=eq.${encodeURIComponent(name)}`,
    { method: "DELETE", headers: SB_HDR }
  );
  if (!res.ok) console.error("Album delete failed", await res.text());
}
