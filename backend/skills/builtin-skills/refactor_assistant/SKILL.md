---
name: refactor_assistant
version: 1.0.0
description: Intelligent code refactoring assistant for improving code quality and maintainability
trigger: [refactor, improve, clean up, optimize, restructure, simplify]
---

# Refactor Assistant Skill

## Purpose
Help developers refactor code to improve readability, maintainability, performance, and adherence to best practices while preserving functionality.

## When to Use
- Improving code readability
- Reducing code duplication
- Extracting reusable components
- Optimizing performance
- Modernizing legacy code
- Applying design patterns

## Refactoring Process

1. **Analyze Current Code**
   - Read the source files
   - Identify code smells:
     - Long methods/functions
     - Large classes/modules
     - Duplicate code
     - Complex conditionals
     - Magic numbers/strings
     - Deep nesting

2. **Plan Refactoring**
   - Identify target improvements
   - Ensure tests exist or create them
   - Plan incremental changes
   - Consider backward compatibility

3. **Apply Refactoring Patterns**

   ### Extract Method/Function
   - Identify cohesive code blocks
   - Extract into named functions
   - Pass necessary parameters
   - Return appropriate values

   ### Rename for Clarity
   - Use descriptive names
   - Follow naming conventions
   - Update all references

   ### Simplify Conditionals
   - Replace nested conditionals with guard clauses
   - Use polymorphism instead of type checks
   - Apply strategy pattern for complex logic

   ### Remove Duplication
   - Extract common logic
   - Create utility functions
   - Use inheritance/composition

   ### Improve Data Structures
   - Replace primitives with objects
   - Use appropriate collections
   - Apply proper typing

4. **Verify Changes**
   - Run all tests
   - Check for regressions
   - Verify performance
   - Review code quality metrics

## Refactoring Principles
- Small, incremental changes
- Test-driven refactoring
- Preserve external behavior
- Improve internal structure
- Document significant changes

## Output Format
```
# Refactoring Plan

## Current Issues
1. [Issue description]
   - Location: file:line
   - Impact: [description]

## Proposed Changes
1. [Change description]
   - Before: [code snippet]
   - After: [code snippet]
   - Benefit: [improvement]

## Verification Steps
1. [Step to verify change]
```

## Tools Used
- Read
- Write
- Edit
- MultiEdit
- Bash (run tests)
- Grep
