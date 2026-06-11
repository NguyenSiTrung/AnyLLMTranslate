# Chrome Web Store Publishing Guide

This guide walks you through the step-by-step process of publishing **AnyLLMTranslate** to the Chrome Web Store.

---

## 🛠️ Step 1: Prepare the Extension Bundles

Google Web Store requires a built zip file of your extension. Additionally, since the extension connects to external APIs, reviewers often ask for your original source code to verify security compliance.

### 1. Build the Production Extension Zip
This command compiles and packages the extension in production mode (minified and optimized) into a `.zip` file ready for upload.
```bash
pnpm zip
```
*Output location:* `.output/anyllm-translate-chrome-mv3.zip`

### 2. Package the Source Code (Highly Recommended)
Google reviewers frequently request the unminified source code for auditing extensions that interact with external LLM endpoints. 
```bash
pnpm zip:source
```
*Output location:* `source-code.zip` (in the root directory)
*How it works:* It uses `git archive` to package only files tracked by git, ensuring no `node_modules`, build artifacts, secrets, or untracked local configurations are included. Keep this zip ready to upload if requested by the reviewer.

---

## 🎨 Step 2: Prepare Store Assets

Before creating the listing, make sure you have the following assets ready:

| Asset | Size / Format | Requirement | Notes |
|-------|---------------|-------------|-------|
| **Extension Icon** | `128x128px` (PNG) | **Required** | Already located in `public/icon/128.png` |
| **Store Tile Icon** | `128x128px` (PNG) | **Required** | The same or a slightly modified version of the main icon |
| **Screenshots** | `1280x800px` or `640x400px` (PNG/JPEG) | **Required** | At least 1 is mandatory (up to 5). Show options/popup UI and the bilingual translation inside a webpage. |
| **Promo Banners** | `440x280px` (PNG) | *Optional* | Recommended for better discoverability |

---

## 📝 Step 3: Developer Console Listing Checklist

Access the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).

### 1. Basic Metadata
*   **Product Name:** `AnyLLMTranslate` (Keep trademarks like "OpenAI" or "ChatGPT" out of the main title to avoid automated rejections).
*   **Description:** Clear and concise explanation. Explicitly specify that this is a **"Bring Your Own Key" (BYOK)** extension so users know they need an API key from an LLM provider (e.g. OpenAI, OpenRouter, self-hosted, etc.).

### 2. Privacy Policy URL
Google requires a public privacy policy because the extension reads and translates webpage content.
*   Host the content of the root [PRIVACY.md](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/PRIVACY.md) on a public URL (e.g. GitHub Pages or a raw GitHub link).
*   Provide that link in the **Privacy Policy URL** input box.

---

## 🛡️ Step 4: Permissions & Data Disclosures

During submission, you must justify your permissions and declare data usage.

### 1. Permission Justifications
Use these explanations in the console for each permission declared in [wxt.config.ts](file:///home/trung/Documents/ML/Project/AnyLLMTranslate/wxt.config.ts):

*   **`activeTab`:** *"To read the text content of the active tab for translation when explicitly triggered by the user."*
*   **`storage`:** *"To store translation cache, layout settings, and API credentials locally in the browser."*
*   **`contextMenus`:** *"To show a right-click 'Translate' option when the user highlights text on a webpage."*
*   **`sidePanel`:** *"To display translation side-by-side inside Chrome's side panel."*
*   **`alarms`:** *"To schedule minor background sync/cache-cleaning routines."*

### 2. Data Usage Disclosures
Under the **Data Usage** section, fill in the following:
*   **Data Collection:** Select **"Yes"** to using Webpage Content (user activity) because the extension reads page content to translate it.
*   **Justification:** Explain: *"The extension reads webpage text content, passes it to the user's custom-configured API provider for translation, and displays the response to the user. No webpage content is collected, stored, or transmitted to servers owned by the extension developers."*
*   **Data Safety:** Confirm that data is sent only to the user's chosen API provider, is not sold, is not used for unrelated purposes, and is not used for credit assessment.

---

## 🚀 Step 5: Submit for Review

1. Create a developer account and pay the one-time **$5 USD** fee.
2. Complete verification.
3. Upload `.output/anyllm-translate-chrome-mv3.zip`.
4. Fill out the Store Listing, Privacy page, and justifications.
5. Submit for Review.

*Review Timeline:* Because you use the highly safe `activeTab` permission instead of wildcard host permissions (like `<all_urls>`), the extension qualifies for faster reviews. It should be approved within **24 to 72 hours**.
