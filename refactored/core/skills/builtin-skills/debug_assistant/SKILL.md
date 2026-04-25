---
name: debug_assistant
version: 1.0.0
description: Intelligent debugging assistant for finding and fixing bugs in code
trigger: [debug, bug, error, fix, troubleshoot, exception, crash]
---

# Debug Assistant Skill

## Purpose
Help developers identify, diagnose, and fix bugs in their code through systematic debugging approaches.

## When to Use
- Debugging runtime errors
- Investigating unexpected behavior
- Fixing test failures
- Resolving compilation errors
- Troubleshooting performance issues

## Debugging Process

1. **Gather Information**
   - Read error messages and stack traces
   - Use Bash to run tests and see failures
   - Use Read to examine relevant code files
   - Use Grep to find error patterns in logs

2. **Reproduce the Issue**
   - Identify steps to reproduce
   - Check environment differences
   - Verify input data
   - Isolate the problem area

3. **Analyze Root Cause**
   - Trace execution flow
   - Check variable states
   - Review recent changes
   - Look for common bug patterns:
     - Off-by-one errors
     - Null/undefined references
     - Type mismatches
     - Race conditions
     - Memory leaks

4. **Develop Fix**
   - Propose minimal fix
   - Consider edge cases
   - Ensure fix doesn't break other functionality
   - Add tests to prevent regression

5. **Verify Fix**
   - Run tests
   - Check for side effects
   - Verify performance impact

## Common Bug Patterns

### TypeScript/JavaScript
- Undefined/null reference errors
- Type coercion issues
- Async/await mistakes
- Closure variable capture
- Event listener leaks

### Python
- Mutable default arguments
- Import cycles
- GIL-related concurrency issues
- Memory leaks in long-running processes

### General
- Off-by-one errors
- Race conditions
- Resource leaks
- Incorrect error handling

## Output Format
```
# Debug Report

## Error
[Error message and context]

## Root Cause
[Explanation of what's causing the issue]

## Fix
[Code change with explanation]

## Verification
[Steps to verify the fix works]

## Prevention
[How to avoid this bug in the future]
```

## Tools Used
- Read
- Grep
- Glob
- Bash
- Write (for applying fixes)
