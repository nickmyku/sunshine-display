# Security Audit Report

**Project:** AccuWeather Culver City Weather App  
**Audit Date:** January 13, 2026  
**Auditor:** Security Audit Tool

---

## Executive Summary

This security audit identified **10 security vulnerabilities** across the application, including **3 HIGH**, **4 MEDIUM**, and **3 LOW** severity issues. The most critical findings involve a known dependency vulnerability, potential XSS attack vectors, and overly permissive CORS configuration.

---

## Findings Summary

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| 1 | 🔴 HIGH | Dependency Vulnerability (qs package) | ✅ Fixed |
| 2 | 🔴 HIGH | XSS Vulnerability via innerHTML | ✅ Fixed |
| 3 | 🔴 HIGH | Unrestricted CORS Configuration | ✅ Fixed |
| 4 | 🟠 MEDIUM | No Rate Limiting | ✅ Fixed |
| 5 | 🟠 MEDIUM | Missing Security Headers | ✅ Fixed |
| 6 | 🟠 MEDIUM | Puppeteer Sandbox Disabled | ⚠️ Documented |
| 7 | 🟠 MEDIUM | Error Information Leakage | ✅ Fixed |
| 8 | 🟡 LOW | No Input Validation on PORT | ✅ Fixed |
| 9 | 🟡 LOW | No HTTPS Enforcement | ℹ️ Deployment Config |
| 10 | 🟡 LOW | Predictable Screenshot Path | ℹ️ Minor |

---

## Detailed Findings

### 1. 🔴 HIGH - Dependency Vulnerability (qs package)

**Location:** `package.json` → transitive dependency via Express  
**Description:** The `qs` package has a high severity vulnerability (GHSA-6rw7-vpxm-498p) that allows DoS via memory exhaustion through arrayLimit bypass in bracket notation.

**Risk:** An attacker can craft malicious query strings to exhaust server memory, causing denial of service.

**Remediation:** 
```bash
npm audit fix
```

**Status:** ✅ Fixed by running `npm audit fix`

---

### 2. 🔴 HIGH - XSS Vulnerability via innerHTML

**Location:** `public/app.js`, `createWeatherCard` function  
**Description:** The frontend uses `innerHTML` to render weather data without sanitization. If scraped data contains malicious HTML/JavaScript, it could execute in users' browsers.

**Vulnerable Code:**
```javascript
card.innerHTML = `
    <div class="time">${timeStr}</div>
    <div class="icon-phrase">${hour.iconPhrase}</div>  // Unsanitized data
    ...
`;
```

**Risk:** Cross-Site Scripting (XSS) attack if AccuWeather's page or a MITM attacker injects malicious content.

**Remediation:** Use `textContent` instead of `innerHTML` for user-controllable data, or implement proper HTML escaping.

**Status:** ✅ Fixed - Refactored to use DOM manipulation with `textContent`

---

### 3. 🔴 HIGH - Unrestricted CORS Configuration

**Location:** `server.js`, line 17  
**Description:** CORS is enabled with default settings (`app.use(cors())`), allowing any origin to make requests to the API.

**Vulnerable Code:**
```javascript
app.use(cors());
```

**Risk:** Any malicious website can make API requests on behalf of users, potentially leading to data exposure or resource abuse.

**Remediation:** Configure CORS with specific allowed origins:
```javascript
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ['GET'],
    optionsSuccessStatus: 200
}));
```

**Status:** ✅ Fixed - CORS now restricted to configured origins

---

### 4. 🟠 MEDIUM - No Rate Limiting

**Location:** `server.js`, API endpoints  
**Description:** The `/api/hourly-forecast` endpoint has no rate limiting, making it vulnerable to denial-of-service attacks.

**Risk:** Attackers can overwhelm the server with requests, causing resource exhaustion and service unavailability.

**Remediation:** Implement rate limiting using `express-rate-limit`:
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per window
});
app.use('/api/', limiter);
```

**Status:** ✅ Fixed - Rate limiting implemented (100 requests per 15 minutes)

---

### 5. 🟠 MEDIUM - Missing Security Headers

**Location:** `server.js`  
**Description:** The application lacks essential HTTP security headers that protect against common web vulnerabilities.

**Missing Headers:**
- `X-Content-Type-Options` - Prevents MIME-type sniffing
- `X-Frame-Options` - Prevents clickjacking
- `X-XSS-Protection` - Legacy XSS protection
- `Content-Security-Policy` - Controls resource loading
- `Strict-Transport-Security` - Forces HTTPS

**Risk:** The application is more susceptible to XSS, clickjacking, and other injection attacks.

**Remediation:** Use the `helmet` middleware:
```javascript
const helmet = require('helmet');
app.use(helmet());
```

**Status:** ✅ Fixed - Helmet middleware added with custom CSP enabled

**Safari Compatibility Notes (Updated January 14, 2026):**
Safari has known compatibility issues with certain security headers that can cause CSS and JavaScript loading failures:
- `crossOriginEmbedderPolicy: false` - Disabled to prevent Safari from blocking subresources
- `crossOriginOpenerPolicy: false` - Disabled to prevent same-origin resource loading issues in Safari
- `crossOriginResourcePolicy: false` - Disabled as Safari may incorrectly block same-origin resources
- Explicit MIME types set for static CSS/JS files (Safari with `X-Content-Type-Options: nosniff` requires exact MIME types)

---

### 6. 🟠 MEDIUM - Puppeteer Sandbox Disabled

**Location:** `server.js`, `initBrowser` function  
**Description:** Chromium is launched with `--no-sandbox` and `--disable-setuid-sandbox` flags, which disable security sandboxing.

**Vulnerable Code:**
```javascript
args: [
    '--no-sandbox', 
    '--disable-setuid-sandbox',
    ...
]
```

**Risk:** If an attacker can execute malicious JavaScript in the browser context (e.g., through a compromised website), they could potentially escape the browser sandbox and access the host system.

**Mitigation:** These flags are sometimes necessary in containerized environments. However, you should:
1. Run the application in an isolated container
2. Use a dedicated user with minimal privileges
3. Consider using a container-based sandboxing solution

**Status:** ⚠️ Documented - Required for containerized deployment; mitigate with container isolation

---

### 7. 🟠 MEDIUM - Error Information Leakage

**Location:** `server.js`, API error handler  
**Description:** Detailed error messages are sent to clients, potentially revealing internal implementation details.

**Vulnerable Code:**
```javascript
res.status(500).json({ 
    error: `Failed to fetch weather data from AccuWeather: ${error.message}. Please try again later.` 
});
```

**Risk:** Error messages may reveal stack traces, file paths, or other sensitive information useful for attackers.

**Remediation:** Return generic error messages to clients and log detailed errors server-side:
```javascript
console.error('Error:', error);
res.status(500).json({ 
    error: 'Failed to fetch weather data. Please try again later.' 
});
```

**Status:** ✅ Fixed - Generic error messages now returned to clients

---

### 8. 🟡 LOW - No Input Validation on PORT

**Location:** `server.js`, line 14  
**Description:** The PORT environment variable is used without validation.

**Code:**
```javascript
const PORT = process.env.PORT || 3000;
```

**Risk:** Invalid port values could cause unexpected behavior.

**Remediation:** Add validation:
```javascript
const PORT = parseInt(process.env.PORT, 10) || 3000;
if (PORT < 1 || PORT > 65535) {
    throw new Error('Invalid PORT configuration');
}
```

**Status:** ✅ Fixed - PORT validation added

---

### 9. 🟡 LOW - No HTTPS Enforcement

**Location:** `server.js`  
**Description:** The server only listens on HTTP without HTTPS support.

**Risk:** Data transmitted between client and server is unencrypted, potentially exposing it to eavesdropping.

**Remediation:** 
1. Deploy behind a reverse proxy (nginx, Apache) with SSL termination
2. Use a service like Cloudflare for automatic HTTPS
3. Or implement HTTPS directly:
```javascript
const https = require('https');
const server = https.createServer({ key, cert }, app);
```

**Status:** ℹ️ Deployment configuration - Recommend using reverse proxy with SSL

---

### 10. 🟡 LOW - Predictable Screenshot Path

**Location:** `server.js`, `saveScreenshotAsBmp` function  
**Description:** Screenshots are saved to a predictable path (`screenshots/current.bmp`).

**Risk:** Attackers could enumerate and access screenshots if directory listing is enabled or path is guessed.

**Mitigation:** The screenshots directory is already excluded from git (`.gitignore`) and access is controlled by static file serving.

**Status:** ℹ️ Minor risk - Acceptable for internal use

---

## Recommendations

### Immediate Actions (Critical)
1. ✅ Run `npm audit fix` to update vulnerable dependencies
2. ✅ Fix XSS vulnerability in frontend code
3. ✅ Configure CORS with specific origins

### Short-term Actions (Within 1 week)
4. ✅ Add rate limiting to API endpoints
5. ✅ Implement security headers with Helmet
6. ✅ Sanitize error messages

### Long-term Actions (Within 1 month)
7. Deploy behind HTTPS reverse proxy
8. Implement proper logging and monitoring
9. Consider adding authentication if needed
10. Regular security audits and dependency updates

---

## Dependencies Added for Security Fixes

```json
{
  "helmet": "^8.0.0",
  "express-rate-limit": "^7.5.0"
}
```

---

## Testing Recommendations

1. **XSS Testing:** Attempt to inject `<script>alert('xss')</script>` in scraped fields
2. **Rate Limiting:** Verify rate limits with tools like `ab` or `siege`
3. **CORS Testing:** Verify cross-origin requests are blocked from unauthorized domains
4. **Security Headers:** Use tools like [securityheaders.com](https://securityheaders.com) to verify headers

---

## Conclusion

This security audit identified several vulnerabilities that have been addressed through code changes and additional security middleware. The application's security posture has been significantly improved. Regular security reviews and dependency updates are recommended to maintain security over time.
