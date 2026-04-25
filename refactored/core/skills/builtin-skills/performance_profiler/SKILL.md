---
name: performance_profiler
version: 1.0.0
description: Analyze and optimize code performance, identify bottlenecks and inefficiencies
trigger: [performance, optimize, slow, bottleneck, profiling, speed up, performance audit]
---

# Performance Profiler Skill

## Purpose
Analyze code for performance bottlenecks, inefficient algorithms, memory leaks, and optimization opportunities. Provide actionable recommendations to improve application speed and resource usage.

## When to Use
- Application is running slowly
- Optimize critical code paths
- Identify memory leaks
- Review algorithm complexity
- Improve database query performance
- Optimize API response times

## Process

1. **Identify Target Areas**
   - Use user input to understand the performance issue
   - Use Glob to find relevant source files
   - Use Grep to search for known performance anti-patterns
   - Focus on hot paths and frequently executed code

2. **Analyze Algorithm Complexity**
   - Look for nested loops (O(n²) or worse)
   - Identify redundant computations
   - Check for unnecessary iterations
   - Review data structure choices

3. **Database Performance**
   - Search for N+1 query patterns
   - Identify missing indexes
   - Review query complexity
   - Check for inefficient joins
   - Analyze query execution plans

4. **Memory Analysis**
   - Look for memory leak patterns
   - Check for large object retention
   - Identify unnecessary allocations
   - Review caching strategies

5. **Network/API Performance**
   - Identify synchronous blocking calls
   - Check for parallelizable operations
   - Review payload sizes
   - Analyze response times

6. **Generate Recommendations**
   - Prioritize by impact
   - Provide specific code changes
   - Include before/after complexity analysis
   - Suggest monitoring metrics

## Common Anti-Patterns

### N+1 Queries
```typescript
// Bad
const users = await getUsers();
for (const user of users) {
  user.posts = await getPosts(user.id); // Query per user
}

// Good
const users = await getUsersWithPosts(); // Single query with join
```

### Inefficient Loops
```typescript
// Bad - O(n²)
const unique = arr.filter((item, index) => arr.indexOf(item) === index);

// Good - O(n)
const unique = [...new Set(arr)];
```

### Unnecessary Computation
```typescript
// Bad - recalculates every render
const sorted = data.sort((a, b) => a.value - b.value);

// Good - memoize or compute once
const sorted = useMemo(() => data.sort((a, b) => a.value - b.value), [data]);
```

### Blocking Operations
```typescript
// Bad - sequential
for (const file of files) {
  await processFile(file);
}

// Good - parallel
await Promise.all(files.map(processFile));
```

## Output Format

```markdown
# Performance Analysis Report

## Summary
- Files analyzed: X
- Issues found: Y (Critical: A, Warning: B, Info: C)
- Estimated improvement: X%

## Critical Issues

### 1. N+1 Query in [file.ts:line]
**Impact:** High - O(n) database queries instead of O(1)
**Current:** `users.map(u => getPosts(u.id))`
**Fix:** Use JOIN or batch loading
**Expected improvement:** 10x faster for 100+ users

## Warnings

### 2. Unnecessary re-computation in [component.tsx:line]
**Impact:** Medium - Recalculates on every render
**Fix:** Add memoization
**Expected improvement:** 50% reduction in render time

## Recommendations
1. [Priority order of fixes]
2. [Monitoring suggestions]
3. [Load testing recommendations]
```

## Tools to Use
- Grep: Search for anti-patterns
- Read: Analyze specific code sections
- DatabaseQuery: Check query performance
- Bash: Run profiling tools
