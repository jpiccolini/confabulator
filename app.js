// ============================================================
// CONFABULATOR — app
// Plain JavaScript modules, no build step. Firebase is loaded from
// Google's CDN. Sections:
//   1. Setup and state      4. Rendering
//   2. Firebase wiring      5. Forms and dialogs
//   3. Data actions         6. Demo data
// ============================================================

import { firebaseConfig, cloudinary, site, starterCategories } from "./config.js";

// ---------- 1. Setup and state ----------
const FIREBASE_VERSION = "10.12.2";
const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("PASTE");

const S = {
  user: null,          // Firebase user, or null
  isAdmin: false,
  isMember: false,
  entries: [],         // [{id, title, categoryId, place, story, link, links, imageUrl, authorId, authorName, createdAt}]
  categories: [],      // [{id, name}]
  pending: [],         // admin only: suggested categories
  members: [],         // admin only: [{id: email, note}]
  cat: "all",
  q: "",
  person: null,        // uid to filter by
  editingId: null,
};

let fb = null;         // Firebase functions once loaded
let db = null;
let auth = null;

const $ = (sel) => document.querySelector(sel);

// Tiny element builder. Text always goes in as text, never as HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const isHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim());
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
// Name for a category id. Falls back to the starter list, so entries still read
// "Music" before the admin has added the starter categories to the database.
const catName = (id) =>
  S.categories.find((c) => c.id === id)?.name ||
  starterCategories.find((n) => slug(n) === id) ||
  "Other";
const toDate = (t) => (t?.toDate ? t.toDate() : t instanceof Date ? t : t ? new Date(t) : null);
const fmtDate = (t) => { const d = toDate(t); return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "just now"; };

function toast(msg) {
  const t = h("div", { class: "toast", role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// Cloudinary: ask for a resized, auto-format copy so pages stay light.
function sized(url, w) {
  if (!isHttp(url)) return "";
  return url.includes("res.cloudinary.com") && url.includes("/upload/")
    ? url.replace("/upload/", `/upload/c_fill,w_${w},h_${Math.round(w * 9 / 16)},q_auto,f_auto/`)
    : url;
}

// YouTube links get a thumbnail when no photo was added.
function youTubeThumb(link) {
  const m = String(link || "").match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : "";
}

// All of an entry's links. Older entries have a single `link`; newer ones a `links` list.
const MAX_LINKS = 6;
function entryLinks(e) {
  const list = Array.isArray(e?.links) && e.links.length ? e.links : (e?.link ? [e.link] : []);
  return list.filter(isHttp);
}

// The story text with any web addresses turned into clickable links.
function linkify(text) {
  const parts = String(text).split(/(https?:\/\/[^\s<>"]+)/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return part;
    const trail = part.match(/[.,;:!?)\]]+$/)?.[0] || "";
    const url = trail ? part.slice(0, -trail.length) : part;
    return [h("a", { href: url, target: "_blank", rel: "noopener" }, url), trail];
  });
}

// The story with simple formatting: **bold**, *italic*, and clickable web addresses.
// Built as page elements, never as HTML, so nothing typed can inject code.
function richText(text) {
  const parts = String(text).split(/(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*)/g);
  return parts.map((part, i) => {
    if (i % 2 === 0) return linkify(part);
    if (part.startsWith("**")) return h("strong", {}, linkify(part.slice(2, -2)));
    return h("em", {}, linkify(part.slice(1, -1)));
  });
}

// The story as plain text, for card previews and search.
const plainText = (text) => String(text || "").replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(/\*([^*\s][^*\n]*?)\*/g, "$1");

// Wraps the selected words in the story box with ** or *.
function wrapSelection(marker) {
  const t = $("#fStory");
  const { selectionStart: a, selectionEnd: b, value: v } = t;
  const picked = v.slice(a, b);
  // Already wrapped? Unwrap it.
  if (v.slice(a - marker.length, a) === marker && v.slice(b, b + marker.length) === marker) {
    t.value = v.slice(0, a - marker.length) + picked + v.slice(b + marker.length);
    t.setSelectionRange(a - marker.length, b - marker.length);
  } else {
    t.value = v.slice(0, a) + marker + picked + marker + v.slice(b);
    t.setSelectionRange(a + marker.length, b + marker.length);
  }
  t.focus();
}

function linkLabel(link) {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    if (/youtube|youtu\.be/.test(host)) return "Watch on YouTube";
    if (/spotify/.test(host)) return "Listen on Spotify";
    if (/google\.[a-z.]+$/.test(host) || /maps\.app\.goo\.gl/.test(host)) return "Open map";
    if (/wikipedia\.org$/.test(host)) return "Read on Wikipedia";
    if (/music\.apple\.com$/.test(host)) return "Listen on Apple Music";
    if (/bandcamp\.com$/.test(host)) return "Listen on Bandcamp";
    if (/imdb\.com$/.test(host)) return "See on IMDb";
    return "Visit " + host;
  } catch { return "Open link"; }
}

// ---------- 2. Firebase wiring ----------
async function startFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [app, authMod, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  fb = { ...authMod, ...fs };
  const firebaseApp = app.initializeApp(firebaseConfig);
  auth = authMod.getAuth(firebaseApp);
  db = fs.getFirestore(firebaseApp);

  // Public data: everyone sees active categories and entries.
  fb.onSnapshot(
    fb.query(fb.collection(db, "categories"), fb.where("status", "==", "active")),
    (snap) => {
      S.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
      render();
    },
    (err) => showBanner("Error", "Couldn't load categories: " + err.message)
  );
  fb.onSnapshot(
    fb.query(fb.collection(db, "entries"), fb.orderBy("createdAt", "desc"), fb.limit(500)),
    (snap) => {
      S.entries = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      render();
      openFromHash();
    },
    (err) => showBanner("Error", "Couldn't load favorites: " + err.message)
  );

  let adminUnsubs = [];
  authMod.onAuthStateChanged(auth, async (user) => {
    adminUnsubs.forEach((u) => u());
    adminUnsubs = [];
    S.user = user;
    S.isAdmin = false;
    S.isMember = false;
    S.pending = [];
    S.members = [];
    if (user) {
      try {
        S.isAdmin = (await fb.getDoc(fb.doc(db, "admins", user.uid))).exists();
        S.isMember = S.isAdmin || (await fb.getDoc(fb.doc(db, "members", (user.email || "").toLowerCase()))).exists();
      } catch (e) { console.warn(e); }
      // Keep the public display name current.
      fb.setDoc(fb.doc(db, "profiles", user.uid), {
        displayName: (user.displayName || user.email.split("@")[0]).slice(0, 60),
        photoURL: (user.photoURL || "").slice(0, 500),
        updatedAt: fb.serverTimestamp(),
      }).catch((e) => console.warn("profile", e));

      if (S.isAdmin) {
        adminUnsubs.push(fb.onSnapshot(
          fb.query(fb.collection(db, "categories"), fb.where("status", "==", "pending")),
          (snap) => { S.pending = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderAccount(); if ($("#admin").open) renderAdmin(); }
        ));
        adminUnsubs.push(fb.onSnapshot(fb.collection(db, "members"),
          (snap) => { S.members = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)); if ($("#admin").open) renderAdmin(); }
        ));
      }
    }
    render();
  });
}

async function signIn() {
  if (DEMO) { toast("Demo mode: connect Firebase in config.js to sign in."); return; }
  try {
    await fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user") showBanner("Sign-in", e.message);
  }
}

// ---------- 3. Data actions ----------
async function saveEntry(data) {
  const author = S.user.displayName || S.user.email.split("@")[0];
  if (S.editingId) {
    const old = S.entries.find((e) => e.id === S.editingId);
    await fb.setDoc(fb.doc(db, "entries", S.editingId), {
      ...data,
      authorId: old.authorId,
      authorName: old.authorName,
      createdAt: old.createdAt,
      updatedAt: fb.serverTimestamp(),
    });
    return S.editingId;
  }
  const ref = await fb.addDoc(fb.collection(db, "entries"), {
    ...data,
    authorId: S.user.uid,
    authorName: author.slice(0, 60),
    createdAt: fb.serverTimestamp(),
    updatedAt: fb.serverTimestamp(),
  });
  return ref.id;
}

async function deleteEntry(id) {
  await fb.deleteDoc(fb.doc(db, "entries", id));
}

async function suggestCategory(name) {
  const id = slug(name);
  if (!id) throw new Error("Type a category name first.");
  if (S.categories.some((c) => c.id === id)) throw new Error(`"${catName(id)}" already exists.`);
  await fb.setDoc(fb.doc(db, "categories", id), {
    name,
    status: S.isAdmin ? "active" : "pending",
    suggestedBy: S.user.uid,
    suggestedByName: (S.user.displayName || "").slice(0, 60),
    createdAt: fb.serverTimestamp(),
  });
}

async function uploadToCloudinary(file) {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", cloudinary.uploadPreset);
  body.append("folder", "confabulator");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || "Upload failed");
  return json.secure_url;
}

// ---------- 4. Rendering ----------
function showBanner(label, text, extra) {
  $("#banner").replaceChildren(h("div", { class: "banner" }, h("b", {}, label), text, extra || ""));
}

function renderAccount() {
  const nav = $("#acct");
  if (!S.user) {
    nav.replaceChildren(h("button", { class: "btn primary", onclick: signIn }, "Sign in with Google"));
    return;
  }
  const me = h("span", { class: "me" },
    isHttp(S.user.photoURL) ? h("img", { src: S.user.photoURL, alt: "", referrerpolicy: "no-referrer" }) : null,
    S.user.displayName || S.user.email);
  nav.replaceChildren(...[
    S.isMember ? h("button", { class: "btn primary", onclick: () => openEditor() }, "Add a favorite") : null,
    h("button", { class: "btn ghost", onclick: () => { S.person = S.user.uid; render(); } }, "Mine"),
    S.isAdmin ? h("button", { class: "btn", onclick: openAdmin }, S.pending.length ? `Admin (${S.pending.length})` : "Admin") : null,
    me,
    h("button", { class: "btn ghost", onclick: () => DEMO ? null : fb.signOut(auth) }, "Sign out"),
  ].filter(Boolean));
}

function renderBanner() {
  if (DEMO) {
    showBanner("Demo mode", "These are sample favorites. Paste your Firebase settings into config.js to go live.");
  } else if (S.user && !S.isMember) {
    showBanner("Almost in", `You're signed in as ${S.user.email}. Ask ${site.ownerName} to add that address so you can post.`);
  } else if (!S.user) {
    showBanner("Welcome", "Browse freely. Friends on the list can sign in to add their own favorites.");
  } else {
    $("#banner").replaceChildren();
  }
}

function renderChips() {
  const used = new Set(S.entries.map((e) => e.categoryId));
  const cats = S.categories.filter((c) => used.has(c.id));
  const chip = (id, label) => h("button", {
    class: "chip", "aria-pressed": String(S.cat === id),
    onclick: () => { S.cat = id; render(); },
  }, label);
  $("#chips").replaceChildren(chip("all", "Everything"), ...cats.map((c) => chip(c.id, c.name)));

  const pf = $("#personFilter");
  if (S.person) {
    const name = S.entries.find((e) => e.authorId === S.person)?.authorName || "this person";
    pf.replaceChildren(h("span", { class: "person" },
      `Showing favorites from ${S.user && S.person === S.user.uid ? "you" : name}`,
      h("button", { class: "btn ghost", onclick: () => { S.person = null; render(); } }, "Show everyone")));
  } else pf.replaceChildren();
}

function filtered() {
  const q = S.q.trim().toLowerCase();
  return S.entries.filter((e) =>
    (S.cat === "all" || e.categoryId === S.cat) &&
    (!S.person || e.authorId === S.person) &&
    (!q || [e.title, e.place, plainText(e.story), e.authorName, catName(e.categoryId)].join(" ").toLowerCase().includes(q))
  );
}

// Striped placeholder with the first letter, used when there's no photo or it won't load.
function noPic(e) {
  return h("div", { class: "nopic", "aria-hidden": "true" }, (e.title || "?").trim()[0].toUpperCase());
}

function card(e) {
  const img = sized(e.imageUrl, 640) || entryLinks(e).map(youTubeThumb).find(Boolean) || "";
  return h("article", {
    class: "card", tabindex: "0", role: "button",
    "aria-label": `${e.title}, ${catName(e.categoryId)}`,
    onclick: () => openDetail(e.id),
    onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDetail(e.id); } },
  },
    img ? h("img", { class: "pic", src: img, alt: "", loading: "lazy", onerror: (ev) => ev.target.replaceWith(noPic(e)) }) : noPic(e),
    h("div", { class: "body" },
      h("h3", {}, e.title),
      e.place ? h("div", { class: "place" }, e.place) : null,
      e.story ? h("p", { class: "excerpt" }, plainText(e.story)) : null,
      h("div", { class: "from" }, `from ${e.authorName} · ${fmtDate(e.createdAt)}`)),
    h("span", { class: "postmark", "aria-hidden": "true" }, catName(e.categoryId)),
  );
}

function renderGrid() {
  const list = filtered();
  const grid = $("#grid");
  if (!list.length) {
    const msg = S.entries.length
      ? "Nothing matches. Try another category or clear the search."
      : S.isMember ? "No favorites yet. Add the first one." : "No favorites posted yet.";
    grid.replaceChildren(h("div", { class: "empty" }, msg));
  } else {
    grid.replaceChildren(...list.map(card));
  }
  const people = new Set(S.entries.map((e) => e.authorId)).size;
  $("#count").textContent = `${S.entries.length} favorites from ${people} ${people === 1 ? "friend" : "friends"}`;
}

function render() {
  renderAccount();
  renderBanner();
  renderChips();
  renderGrid();
}

// ---------- 5. Forms and dialogs ----------
function openDetail(id) {
  const e = S.entries.find((x) => x.id === id);
  if (!e) return;
  const dlg = $("#detail");
  const mine = S.user && (S.user.uid === e.authorId || S.isAdmin);
  const img = sized(e.imageUrl, 1200) || entryLinks(e).map(youTubeThumb).find(Boolean) || "";
  let confirmDel = false;
  dlg.replaceChildren(
    img ? h("img", { class: "detail-img", src: img, alt: "", onerror: (ev) => ev.target.remove() }) : "",
    h("div", { class: "sheet-inner" },
      h("div", { class: "tagline" }, catName(e.categoryId)),
      h("h2", {}, e.title),
      e.place ? h("div", { class: "place" }, e.place) : null,
      e.story ? h("p", { class: "story" }, richText(e.story)) : null,
      h("div", { class: "from" },
        "from ",
        h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); dlg.close(); S.person = e.authorId; render(); } }, e.authorName),
        ` · ${fmtDate(e.createdAt)}`),
      h("div", { class: "row" },
        entryLinks(e).map((url, i) => h("a", { class: i === 0 ? "btn primary" : "btn", href: url, target: "_blank", rel: "noopener" }, linkLabel(url))),
        h("button", { class: "btn", onclick: () => share(e) }, "Copy share link"),
        mine ? h("button", { class: "btn", onclick: () => { dlg.close(); openEditor(e); } }, "Edit") : null,
        mine ? h("button", { class: "btn danger", onclick: async (ev) => {
          if (!confirmDel) { confirmDel = true; ev.target.textContent = "Click again to delete"; return; }
          try { await deleteEntry(e.id); dlg.close(); toast("Deleted"); } catch (err) { toast(err.message); }
        } }, "Delete") : null,
        h("button", { class: "btn ghost", onclick: () => dlg.close() }, "Close"),
      ),
    ),
  );
  history.replaceState(null, "", "#e=" + e.id);
  dlg.showModal();
}
$("#detail").addEventListener("close", () => history.replaceState(null, "", location.pathname));

async function share(e) {
  const url = `${location.origin}${location.pathname}#e=${e.id}`;
  try { await navigator.clipboard.writeText(url); toast("Link copied"); }
  catch { window.prompt("Copy this link:", url); }
}

let hashHandled = false;
function openFromHash() {
  if (hashHandled) return;
  const m = location.hash.match(/^#e=([\w-]+)/);
  if (m && S.entries.some((e) => e.id === m[1])) { hashHandled = true; openDetail(m[1]); }
}

function fillCategorySelect(selected) {
  const sel = $("#fCat");
  const cats = S.categories.length ? S.categories : starterCategories.map((n) => ({ id: slug(n), name: n }));
  sel.replaceChildren(...cats.map((c) => h("option", { value: c.id }, c.name)));
  if (selected) sel.value = selected;
}

function openEditor(e = null) {
  S.editingId = e ? e.id : null;
  $("#editorTitle").textContent = e ? "Edit favorite" : "Add a favorite";
  $("#saveBtn").textContent = e ? "Save changes" : "Post it";
  fillCategorySelect(e?.categoryId);
  $("#fTitle").value = e?.title || "";
  $("#fPlace").value = e?.place || "";
  $("#fStory").value = e?.story || "";
  $("#fLinks").value = entryLinks(e).join("\n");
  $("#fImage").value = e?.imageUrl || "";
  $("#formMsg").textContent = "";
  $("#suggestMsg").textContent = "";
  updatePreview();
  $("#uploadBox").replaceChildren(cloudinary.cloudName && cloudinary.uploadPreset
    ? h("label", { for: "fFile" }, "Or upload a photo",
        h("input", { id: "fFile", type: "file", accept: "image/*", onchange: onFile }))
    : "");
  $("#editor").showModal();
}

// Shows the photo under the link field, or explains why it can't.
function updatePreview() {
  const url = $("#fImage").value.trim();
  const p = $("#fPreview");
  const msg = $("#formMsg");
  if (msg.dataset.photo) { msg.textContent = ""; delete msg.dataset.photo; }
  p.hidden = !isHttp(url);
  if (!isHttp(url)) return;
  p.onerror = () => {
    p.hidden = true;
    msg.dataset.photo = "1";
    msg.textContent = /wikipedia\.org\/wiki\//.test(url)
      ? "That's a Wikipedia page, not the picture. Click the image on Wikipedia until it shows on its own, then right-click it and choose Copy Image Address. The link should start with https://upload.wikimedia.org/"
      : "That link doesn't load as a picture. Right-click the image itself and choose Copy Image Address.";
  };
  p.src = sized(url, 480);
}
$("#fImage").addEventListener("input", updatePreview);

async function onFile(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { $("#formMsg").textContent = "That photo is over 10 MB. Try a smaller one."; return; }
  $("#formMsg").textContent = "Uploading photo…";
  $("#saveBtn").disabled = true;
  try {
    $("#fImage").value = await uploadToCloudinary(file);
    updatePreview();
    $("#formMsg").textContent = "";
  } catch (err) {
    $("#formMsg").textContent = "Photo upload failed: " + err.message;
  } finally {
    $("#saveBtn").disabled = false;
  }
}

$("#entryForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (DEMO) { $("#formMsg").textContent = "Demo mode: connect Firebase to post."; return; }
  const links = $("#fLinks").value.split(/\s+/).map((l) => l.trim()).filter(Boolean);
  const imageUrl = $("#fImage").value.trim();
  const badLink = links.find((l) => !isHttp(l) || l.length > 500);
  if (badLink) { $("#formMsg").textContent = `This link needs to start with https:// : ${badLink.slice(0, 60)}`; return; }
  if (links.length > MAX_LINKS) { $("#formMsg").textContent = `Up to ${MAX_LINKS} links, please. You have ${links.length}.`; return; }
  if (imageUrl && !isHttp(imageUrl)) { $("#formMsg").textContent = "Photo links need to start with https://"; return; }
  const data = {
    title: $("#fTitle").value.trim(),
    categoryId: $("#fCat").value,
    place: $("#fPlace").value.trim(),
    story: $("#fStory").value.trim(),
    link: links[0] || "",   // first link, kept for older versions of the site
    links,
    imageUrl,
  };
  $("#saveBtn").disabled = true;
  $("#formMsg").textContent = "Saving…";
  try {
    const wasEdit = !!S.editingId;
    await saveEntry(data);
    $("#editor").close();
    toast(wasEdit ? "Saved" : "Posted");
  } catch (err) {
    $("#formMsg").textContent = err.code === "permission-denied"
      ? `You're not on the list yet. Ask ${site.ownerName} to add ${S.user.email}.`
      : "Couldn't save: " + err.message;
  } finally {
    $("#saveBtn").disabled = false;
  }
});
$("#cancelBtn").addEventListener("click", () => $("#editor").close());

// Bold and italic: the B and I buttons, or Cmd/Ctrl+B and Cmd/Ctrl+I in the story box.
$("#boldBtn").addEventListener("click", () => wrapSelection("**"));
$("#italicBtn").addEventListener("click", () => wrapSelection("*"));
$("#fStory").addEventListener("keydown", (ev) => {
  if (!(ev.metaKey || ev.ctrlKey)) return;
  const k = ev.key.toLowerCase();
  if (k === "b") { ev.preventDefault(); wrapSelection("**"); }
  if (k === "i") { ev.preventDefault(); wrapSelection("*"); }
});

$("#suggestBtn").addEventListener("click", async () => {
  const name = $("#fNewCat").value.trim();
  const msg = $("#suggestMsg");
  if (DEMO) { msg.textContent = "Demo mode: connect Firebase to suggest categories."; return; }
  try {
    await suggestCategory(name);
    $("#fNewCat").value = "";
    msg.textContent = S.isAdmin ? `Added "${name}".` : `Sent "${name}" to ${site.ownerName} for approval. Post under Other for now.`;
    if (S.isAdmin) setTimeout(() => fillCategorySelect(slug(name)), 600);
  } catch (err) {
    msg.textContent = err.code === "permission-denied" ? "Only friends on the list can suggest categories." : err.message;
  }
});

// Admin panel: approve categories, manage who can post.
function openAdmin() { renderAdmin(); $("#admin").showModal(); }

function renderAdmin() {
  const dlg = $("#admin");
  const missingStarters = starterCategories.filter((n) => !S.categories.some((c) => c.id === slug(n)));
  const emailInput = h("input", { id: "aEmail", type: "email", placeholder: "friend@gmail.com", autocomplete: "off" });
  const noteInput = h("input", { id: "aNote", maxlength: "80", placeholder: "Name or note (optional)" });
  const act = (fn) => async (...args) => { try { await fn(...args); } catch (e) { toast(e.message); } };

  dlg.replaceChildren(h("div", { class: "sheet-inner admin" },
    h("h2", {}, "Admin"),

    h("h3", {}, "Category suggestions"),
    S.pending.length
      ? h("ul", {}, S.pending.map((c) => h("li", {},
          h("span", {}, `${c.name} — from ${c.suggestedByName || "a friend"}`),
          h("span", { class: "row" },
            h("button", { class: "btn primary", onclick: act(() => fb.updateDoc(fb.doc(db, "categories", c.id), { status: "active" })) }, "Approve"),
            h("button", { class: "btn danger", onclick: act(() => fb.deleteDoc(fb.doc(db, "categories", c.id))) }, "Decline")))))
      : h("p", { class: "hint" }, "No suggestions waiting."),

    missingStarters.length ? h("div", {},
      h("h3", {}, "Starter categories"),
      h("button", { class: "btn", onclick: act(async () => {
        for (const n of missingStarters) {
          await fb.setDoc(fb.doc(db, "categories", slug(n)), { name: n, status: "active", suggestedBy: S.user.uid, suggestedByName: "", createdAt: fb.serverTimestamp() });
        }
        toast(`Added ${missingStarters.length} categories`);
        renderAdmin();
      }) }, `Add ${missingStarters.length} starter categories`)) : null,

    h("h3", {}, `Friends who can post (${S.members.length})`),
    h("form", { class: "row", onsubmit: act(async (ev) => {
      ev.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("Enter a full email address."); return; }
      await fb.setDoc(fb.doc(db, "members", email), { addedAt: fb.serverTimestamp(), note: noteInput.value.trim().slice(0, 80) });
      emailInput.value = ""; noteInput.value = "";
      toast("Added " + email);
    }) }, emailInput, noteInput, h("button", { class: "btn primary", type: "submit" }, "Add")),
    h("ul", {}, S.members.map((m) => h("li", {},
      h("span", {}, m.id + (m.note ? ` — ${m.note}` : "")),
      h("button", { class: "btn ghost", onclick: act(() => fb.deleteDoc(fb.doc(db, "members", m.id))) }, "Remove")))),

    h("div", { class: "row" }, h("button", { class: "btn", onclick: () => dlg.close() }, "Done")),
  ));
}
// The add-friend form handles its own submit; stop the browser from also
// doing a full-page form submission.
$("#admin").addEventListener("submit", (e) => e.preventDefault());

// Search, home link, back to everyone.
$("#q").addEventListener("input", (e) => { S.q = e.target.value; renderGrid(); });
$("#home").addEventListener("click", (e) => { e.preventDefault(); S.cat = "all"; S.person = null; S.q = ""; $("#q").value = ""; render(); });

// ---------- 6. Demo data ----------
function loadDemo() {
  S.categories = ["Restaurants", "Places to visit", "Books", "Music", "Podcasts", "Services & trades", "Other"]
    .map((n) => ({ id: slug(n), name: n }));
  const d = (days) => new Date(Date.now() - days * 864e5);
  S.entries = [
    { id: "demo1", title: "Morning bakery on the square", categoryId: "restaurants", place: "Dijon, France", story: "Get there before 8 and order whatever just came out of the oven. The pain d'épices is the real thing.", link: "", imageUrl: "", authorId: "a", authorName: "Sample friend", createdAt: d(1) },
    { id: "demo2", title: "Lake loop at sunset", categoryId: "places-to-visit", place: "Waneka Lake, Lafayette CO", story: "An easy walk with the Flatirons going orange behind you. Bring a jacket; it drops ten degrees fast.", link: "", imageUrl: "", authorId: "b", authorName: "Another friend", createdAt: d(3) },
    { id: "demo3", title: "The Count of Monte Cristo", categoryId: "books", place: "Alexandre Dumas", story: "Twelve hundred pages that read like a weekend. Get the *Robin Buss* translation, **not** the old anonymous one.", link: "", imageUrl: "", authorId: "a", authorName: "Sample friend", createdAt: d(6) },
    { id: "demo4", title: "Kind of Blue", categoryId: "music", place: "Miles Davis, 1959", story: "Still the album I put on when people come over and nobody can agree. Liner notes: https://en.wikipedia.org/wiki/Kind_of_Blue.", link: "", links: ["https://en.wikipedia.org/wiki/Kind_of_Blue", "https://www.youtube.com/watch?v=ylXk1LBvIqU"], imageUrl: "", authorId: "c", authorName: "Third friend", createdAt: d(9) },
    { id: "demo5", title: "Honest mechanic", categoryId: "services-and-trades", place: "Boulder County", story: "Told me not to fix something. That's how you know.", link: "", imageUrl: "", authorId: "b", authorName: "Another friend", createdAt: d(14) },
    { id: "demo6", title: "Ninety-second pasta trick", categoryId: "other", place: "Home kitchen", story: "Save a cup of pasta water. Toss everything off the heat. Thank me later.", link: "", imageUrl: "", authorId: "c", authorName: "Third friend", createdAt: d(20) },
  ];
}

// ---------- Start ----------
document.title = site.name;
$("#siteName").textContent = site.name;
$("#siteTag").textContent = site.tagline;
if (DEMO) {
  loadDemo();
  render();
  openFromHash();
} else {
  render();
  startFirebase().catch((e) => showBanner("Error", "Couldn't start Firebase: " + e.message));
}
