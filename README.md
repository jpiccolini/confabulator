# Confabulator

Favorites from friends, with the story behind each one. Anyone with the link can browse. Friends you add by email can sign in with Google and post.

**Cost: $0.** Everything runs on free plans with nothing that goes to sleep or pauses:

| Piece | Service | Free plan limits that matter |
|---|---|---|
| Sign-in | Firebase Authentication (Google) | 50,000 monthly users |
| Database | Cloud Firestore (Spark plan) | 1 GiB stored, 50,000 reads and 20,000 writes per day |
| Photos (optional) | Cloudinary unsigned uploads | 25 monthly credits |
| Website | Render static site | Static sites don't spin down |

No credit card is needed for any of it. If you ever go over a Firestore daily limit, it stops answering until the next day; it never bills you on the Spark plan.

Why not Firebase Storage for photos? Since February 2026, Cloud Storage for Firebase requires the paid Blaze plan, so photos go to Cloudinary or are pasted as links.

## Files

```
index.html       page structure
style.css        the postcard look (light and dark)
app.js           everything that happens: sign-in, loading, posting, admin
config.js        YOUR settings — the only file you edit to go live
firestore.rules  who may read and write what (pasted into Firebase)
```

Until `config.js` has real Firebase values, the site runs in **demo mode** with six sample favorites, so you can deploy it and look at it right away.

## Setup (about 30 minutes)

Firebase, GitHub and Render redesign their screens often, so these steps say **what you're looking for** as well as where it was in November 2026. If a label doesn't match, see "When the screen doesn't match" at the end of this section.

**Your project ID** is the short name Firebase gave the project, shown in the browser address bar and in `config.js` as `projectId` (for example `confabulator-43f9d`). Every Firebase link below uses it: replace `YOUR-PROJECT-ID` with yours.

### 1. Create the Firebase project and register the web app
1. Open console.firebase.google.com. Check the photo at the top right: it should be your **personal Gmail**, not your school account. Friends outside Dawson must be able to sign in, and you want to keep the project after you leave.
2. **Create a project** → name it `confabulator`. Turn **off** "Join the Google Developer Program", "Gemini in Firebase" and "Google Analytics" (none are needed). Leave "I accept the Firebase terms" ticked → **Create project** → **Continue**.
3. You land on a page that says *Hello, Jim — Welcome to your Firebase project!* with a **Spark plan** badge. Click **+ Add app** under the project name → choose **Web** (the `</>` icon).
4. App nickname: `confabulator-web`. Leave **"Also set up Firebase Hosting"** unticked → **Register app**.
5. The next screen, *Add Firebase SDK*, shows a grey code box. **Ignore** `npm install firebase` and the `import` / `initializeApp` lines. You only need the six values inside `const firebaseConfig = { … }`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
6. In your editor, open `config.js` and replace each `PASTE_…` value with the matching one. Keep `export` at the front of the line. Save.
7. Click **Continue to console**.

Lost the values? Gear icon (top of the left column) → **Project settings** → **General** → scroll to **Your apps** → **Config**.

### 2. Turn on Google sign-in
Go straight there: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/authentication`
(or search the console for **Authentication**).

1. Click **Get started**.
2. Open the **Sign-in method** tab → in the list of providers, click **Google**.
3. Switch on **Enable**. **Public-facing name:** `Confabulator` (friends see this on the Google pop-up). **Project support email:** your Gmail.
4. **Save**. Google now shows **Enabled** in the providers list.

### 3. Create the database and lock it down
Go straight there: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/firestore`
(or search the console for **Firestore**).

1. Click **Create database**.
2. If asked for an **edition**, choose **Standard** (the free one).
3. **Database ID:** leave it as `(default)`. **Location:** `nam5 (United States)` or `us-central1`. This can't be changed later.
4. Choose **Start in production mode** (everything locked until you publish rules) → **Create**. Wait about a minute.
5. Open the **Rules** tab at the top of the Firestore page. Select everything in the editor and delete it.
6. In your editor, open `firestore.rules`, select all (Cmd+A), copy, and paste into the Firebase rules editor.
7. Click **Publish**. A green confirmation means it worked; a red line points to a typo (usually a missing first or last line from the paste).

### 4. Put it on the web
**GitHub**
1. github.com → **+** (top right) → **New repository** → name `confabulator` → Public or Private (Render works with both) → **Create repository**.
2. On the empty repo page, click **uploading an existing file** (or **Add file → Upload files**).
3. Drag in the six files: `index.html`, `style.css`, `app.js`, `config.js`, `firestore.rules`, `README.md`. Drag the files themselves, not the folder they're in, so they land at the top level of the repo.
4. **Commit changes**.

**Render**
1. dashboard.render.com → **New** (top right) → **Static Site** → pick the `confabulator` repo. (If it isn't listed, click **Configure account** and give Render access to it.)
2. **Build Command:** leave blank. **Publish Directory:** `.` (a single dot) → **Deploy Static Site**.
3. When the log says the site is live, copy its address from the top of the page, for example `confabulator-abcd.onrender.com`.

**Firebase: allow sign-in from that address**
1. `https://console.firebase.google.com/project/YOUR-PROJECT-ID/authentication/settings` (or Authentication → **Settings** tab) → **Authorized domains** → **Add domain**.
2. Paste just the domain, with no `https://` and no `/` at the end → **Add**.

Open the site. You should see the postcard grid. Without step 5 it says "Welcome… Browse freely". If it still says **Demo mode**, `config.js` didn't upload with your values.

### 5. Make yourself the admin (one time)
1. On your site, click **Sign in with Google** and choose your Gmail. The yellow banner says **Almost in**; that's expected.
2. Firebase → Authentication → **Users** tab → find your Gmail → copy the long **User UID** (hover over it for a copy button).
3. Firebase → Firestore → **Data** tab → **+ Start collection**.
   - **Collection ID:** `admins` → **Next**
   - **Document ID:** paste your UID (don't click Auto-ID)
   - **Field:** `role` · **Type:** string · **Value:** `owner` → **Save**
4. Reload your site. You now see **Add a favorite** and **Admin** at the top right.

### 6. Fill it in
1. **Admin** → **Add starter categories** (the list lives in `config.js`).
2. **Admin** → **Friends who can post** → type each friend's Google email → **Add**.
3. Send friends the link. Anyone can browse; listed friends sign in to post.

### 7. Optional: photo uploads
1. cloudinary.com → sign in → **Settings** (gear) → **Upload** → **Upload presets** → **Add upload preset**.
2. **Signing mode: Unsigned**. Folder: `confabulator`. Under the limits options, set a max file size (10 MB) and allowed formats (jpg, png, webp, heic) → **Save**.
3. In `config.js`, fill in `cloudName` (shown on the Cloudinary dashboard) and `uploadPreset` (the preset's name). Commit the change on GitHub.

Never put the Cloudinary **API secret** in this repo. Unsigned uploads don't need it.

### When the screen doesn't match
These sites rename and move things. When a step's label isn't there:
1. **Use the direct link** given in the step, with your project ID in it.
2. **Search** inside the site. In Firebase, the magnifying glass at the top of the left column finds any product by name.
3. **Expand the menu.** Firebase's left column has a **›** at the bottom that opens the full product list.
4. **Look for the same meaning, not the same words:** "Create project" may read "Get started with a Firebase project"; "Upload files" may be a link in the middle of an empty repo page.
5. **Screenshot it and ask** your AI helper: "I'm at this screen and the guide says click X. What's the equivalent here?"
6. Check the official docs, which are updated with the screens: firebase.google.com/docs.

## Editing later

Same as your other Render sites: edit a file on GitHub (pencil icon or press `.` for the web editor), commit, and Render redeploys in seconds.

To test on your own computer, the files must be served, not double-clicked (browsers block modules from `file://`):

```
cd confabulator
python3 -m http.server 8000
```

then open http://localhost:8000. `localhost` is already an authorized Firebase domain.

## How the data is shaped

```
entries/{id}      title, categoryId, place, story, link, imageUrl,
                  authorId, authorName, createdAt, updatedAt
categories/{id}   name, status ("active" | "pending"), suggestedBy, suggestedByName, createdAt
members/{email}   addedAt, note            ← who may post
admins/{uid}      role                     ← created by hand, step 5
profiles/{uid}    displayName, photoURL, updatedAt
```

Share links look like `…/#e=<entry id>` and open that favorite directly.

## Using it in class

- `firestore.rules` is a readable example of authorization: public reads, member-only writes, owners editing only their own rows, and an admin role.
- `app.js` is plain modules with no build step, split into six commented sections students can find their way around.
- Students can make their own copy by repeating steps 1–5 with their own Firebase project, the same pattern as the Stocks & Bonds game.

## Ideas for next versions

- "Me too" seconds on a favorite
- A personal page per friend (`#u=<uid>`)
- Map view for places, using Leaflet like the Dijon site
- Comments
