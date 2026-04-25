---
name: test_generator
version: 1.0.0
description: Generate comprehensive unit tests, integration tests, and e2e tests for code
trigger: [test, unit test, integration test, e2e, testing, jest, vitest, pytest]
---

# Test Generator Skill

## Purpose
Automatically generate comprehensive tests for existing code, ensuring good coverage and edge case handling.

## When to Use
- Adding tests to untested code
- Improving test coverage
- Creating integration tests
- Setting up e2e test suites
- Generating test fixtures

## Test Generation Strategy

1. **Analyze Target Code**
   - Read the source file
   - Identify all public functions/methods
   - Understand dependencies
   - Note edge cases and error paths

2. **Determine Test Framework**
   - Check project for existing test setup
   - Use Jest/Vitest for JavaScript/TypeScript
   - Use pytest for Python
   - Use JUnit for Java
   - Match existing project conventions

3. **Generate Test Cases**
   For each function/method:
   - Happy path tests
   - Edge case tests
   - Error handling tests
   - Boundary condition tests
   - Integration tests (if applicable)

4. **Test Structure**
   ```
   describe('FunctionName', () => {
     it('should handle happy path', () => {
       // Test normal operation
     });

     it('should handle edge case', () => {
       // Test edge cases
     });

     it('should throw on invalid input', () => {
       // Test error handling
     });
   });
   ```

5. **Best Practices**
   - One assertion per test (when possible)
   - Descriptive test names
   - Arrange-Act-Assert pattern
   - Mock external dependencies
   - Use test fixtures for complex data
   - Keep tests independent

## Output Format
```typescript
// Generated tests for: [filename]
// Framework: [jest/vitest/pytest/etc]
// Coverage: X% estimated

import { functionName } from './filename';

describe('functionName', () => {
  it('should return expected value for valid input', () => {
    const result = functionName(validInput);
    expect(result).toBe(expectedValue);
  });

  it('should throw error for invalid input', () => {
    expect(() => functionName(invalidInput)).toThrow();
  });

  // ... more tests
});
```

## Tools Used
- Read (analyze source code)
- Write (create test files)
- Bash (run tests)
- Grep (find existing tests)
