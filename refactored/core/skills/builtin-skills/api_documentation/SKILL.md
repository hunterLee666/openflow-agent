---
name: api_documentation
version: 1.0.0
description: Generate comprehensive API documentation from source code
trigger: [api docs, documentation, generate docs, api reference, swagger, openapi]
---

# API Documentation Generator Skill

## Purpose
Analyze source code and generate comprehensive API documentation including endpoints, request/response schemas, authentication requirements, and usage examples.

## When to Use
- Generate API documentation from code
- Create OpenAPI/Swagger specifications
- Document REST or GraphQL APIs
- Update existing documentation
- Create developer guides

## Process

1. **Identify API Files**
   - Use Glob to find route/controller files
   - Look for patterns like `routes/`, `controllers/`, `api/`, `handlers/`
   - Search for route definitions using Grep

2. **Extract Endpoint Information**
   - Read route definition files
   - Extract HTTP methods (GET, POST, PUT, DELETE, PATCH)
   - Identify URL paths and parameters
   - Find request body schemas
   - Locate response types

3. **Analyze Authentication**
   - Search for auth middleware
   - Identify protected vs public endpoints
   - Document required scopes/permissions

4. **Generate Documentation**
   - Create markdown documentation
   - Generate OpenAPI/Swagger YAML or JSON
   - Include code examples
   - Add error response documentation

5. **Review and Validate**
   - Check for missing endpoints
   - Verify parameter types
   - Ensure examples are accurate

## Output Format

```markdown
# API Documentation

## Authentication
All API requests require Bearer token authentication.
Include the token in the Authorization header:
```
Authorization: Bearer <your-token>
```

## Endpoints

### GET /api/users
Retrieve a list of users.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 20) |

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "string",
      "name": "string",
      "email": "string",
      "created_at": "ISO8601"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

**Error Responses:**
- 401 Unauthorized: Invalid or missing token
- 403 Forbidden: Insufficient permissions
```

## Tools to Use
- Glob: Find route files
- Grep: Search for route definitions
- Read: Examine controller/handler code
- Write: Generate documentation files
