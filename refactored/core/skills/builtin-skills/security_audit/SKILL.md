---
name: security_audit
version: 1.0.0
description: Comprehensive security audit for identifying vulnerabilities and security issues in code
trigger: [security, audit, vulnerability, exploit, xss, csrf, injection, authentication, authorization]
---

# Security Audit Skill

## Purpose
Perform comprehensive security audits to identify vulnerabilities, security misconfigurations, and potential attack vectors in code.

## When to Use
- Security code review
- Pre-deployment security check
- Compliance auditing
- Penetration testing preparation
- Security incident investigation

## Security Audit Checklist

### 1. Input Validation
- [ ] All user inputs are validated
- [ ] Type checking is enforced
- [ ] Length limits are applied
- [ ] Format validation (regex, allowlists)
- [ ] Sanitization before use

### 2. Authentication & Authorization
- [ ] Strong password requirements
- [ ] Multi-factor authentication
- [ ] Session management
- [ ] Token expiration
- [ ] Role-based access control
- [ ] Principle of least privilege

### 3. Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] TLS/HTTPS for data in transit
- [ ] No hardcoded secrets
- [ ] Proper key management
- [ ] Data masking in logs
- [ ] GDPR/privacy compliance

### 4. Common Vulnerabilities

#### SQL Injection
- Use parameterized queries
- Avoid string concatenation in SQL
- Use ORM safely

#### XSS (Cross-Site Scripting)
- Escape output
- Use Content Security Policy
- Sanitize HTML input
- Avoid innerHTML

#### CSRF (Cross-Site Request Forgery)
- Use CSRF tokens
- Validate origin headers
- SameSite cookie attribute

#### SSRF (Server-Side Request Forgery)
- Validate URLs
- Use allowlists
- Disable redirects

### 5. Dependency Security
- [ ] No known vulnerable dependencies
- [ ] Regular dependency updates
- [ ] Lock file committed
- [ ] Audit dependencies regularly

### 6. Error Handling
- [ ] No sensitive data in errors
- [ ] Proper error logging
- [ ] User-friendly error messages
- [ ] Graceful degradation

### 7. Configuration Security
- [ ] No secrets in code/config files
- [ ] Environment variables for secrets
- [ ] Secure defaults
- [ ] Disabled debug mode in production

## Common Security Patterns

### Secure Password Storage
```typescript
import bcrypt from 'bcrypt';

const saltRounds = 12;
const hash = await bcrypt.hash(password, saltRounds);
const isValid = await bcrypt.compare(password, hash);
```

### Input Validation
```typescript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(50),
});
```

### Secure Headers
```typescript
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS }));
```

## Output Format
```
# Security Audit Report

## Summary
- Critical Vulnerabilities: X
- High Risk Issues: X
- Medium Risk Issues: X
- Low Risk Issues: X

## Critical Issues
1. [Vulnerability name]
   - Location: file:line
   - Type: [SQLi/XSS/CSRF/etc]
   - Impact: [description]
   - CVSS Score: X.X
   - Fix: [recommendation]

## High Risk Issues
...

## Recommendations
1. [Priority-ordered list of fixes]
```

## Tools Used
- Read
- Grep
- Glob
- Bash (run security scanners)
