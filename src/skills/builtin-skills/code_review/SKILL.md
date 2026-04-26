---
name: code_review
version: 1.0.0
description: Comprehensive code review for quality, security, performance, and maintainability
trigger: [review, code review, pull request, pr, audit]
---

# Code Review Skill

## Purpose
Perform comprehensive code reviews analyzing code for quality, security vulnerabilities, performance issues, and maintainability concerns.

## When to Use
- Review pull requests
- Audit code quality
- Check for security vulnerabilities
- Analyze performance bottlenecks
- Ensure coding standards compliance

## Process

1. **Identify Target Files**
   - Use Glob to find relevant files
   - Use Grep to search for specific patterns
   - Use Read to examine file contents

2. **Security Analysis**
   - Check for hardcoded secrets
   - Look for SQL injection vulnerabilities
   - Identify XSS risks
   - Verify input validation
   - Check authentication/authorization logic

3. **Performance Review**
   - Identify N+1 queries
   - Check for inefficient algorithms
   - Look for memory leaks
   - Analyze database queries
   - Review caching strategies

4. **Code Quality**
   - Check for code duplication
   - Verify error handling
   - Review naming conventions
   - Assess code organization
   - Check documentation

5. **Testing**
   - Verify test coverage
   - Check test quality
   - Look for edge cases
   - Review mock/stub usage

## Output Format
```
# Code Review: [File/PR Name]

## Summary
- Overall Score: X/100
- Critical Issues: X
- Warnings: X
- Suggestions: X

## Critical Issues
1. [Issue description]
   - Location: file:line
   - Impact: [description]
   - Fix: [suggestion]

## Warnings
...

## Suggestions
...
```

## Tools Used
- Read
- Grep
- Glob
- Bash (for running linters/tests)
