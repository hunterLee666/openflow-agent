export interface TemplateContext {
  [key: string]: string | number | boolean | null | undefined | TemplateContext | TemplateContext[];
}

export interface TemplateRenderOptions {
  strict?: boolean;
  missingKey?: "ignore" | "error" | "placeholder";
  placeholder?: string;
}

const DEFAULT_OPTIONS: Required<TemplateRenderOptions> = {
  strict: false,
  missingKey: "placeholder",
  placeholder: "",
};

export class TemplateRenderer {
  private options: Required<TemplateRenderOptions>;

  constructor(options: TemplateRenderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  render(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
      const value = this.getValue(context, key);
      if (value === undefined || value === null) {
        return this.handleMissingKey(key);
      }
      return String(value);
    });
  }

  renderMustache(template: string, context: TemplateContext): string {
    let result = template;

    const sections = this.extractSections(template);

    for (const section of sections) {
      const { name, content, start, end } = section;
      const value = this.getValue(context, name);

      if (Array.isArray(value)) {
        const rendered = value.map((item) => this.renderMustache(content, { ...context, ...this.toFlatContext(item) })).join("");
        result = result.slice(0, start) + rendered + result.slice(end);
      } else if (value && typeof value === "object") {
        const rendered = this.renderMustache(content, { ...context, ...this.flatten(context, name) });
        result = result.slice(0, start) + rendered + result.slice(end);
      } else if (value === false || value === null || value === undefined) {
        result = result.slice(0, start) + "" + result.slice(end);
      }
    }

    return this.render(result, context);
  }

  private extractSections(template: string): Array<{ name: string; content: string; start: number; end: number }> {
    const sections: Array<{ name: string; content: string; start: number; end: number }> = [];
    const sectionRegex = /\{\{(\#)(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\2\}\}/g;

    let match;
    while ((match = sectionRegex.exec(template)) !== null) {
      sections.push({
        name: match[2],
        content: match[3],
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return sections.sort((a, b) => b.start - a.start);
  }

  private getValue(obj: TemplateContext, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === "object" && key in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private handleMissingKey(key: string): string {
    switch (this.options.missingKey) {
      case "ignore":
        return "";
      case "error":
        throw new Error(`Missing template variable: ${key}`);
      case "placeholder":
      default:
        return `{{${key}}}`;
    }
  }

  private toFlatContext(value: unknown): TemplateContext {
    if (value === null || value === undefined) {
      return {};
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value as TemplateContext;
    }
    return {};
  }

  private flatten(obj: TemplateContext, prefix: string): TemplateContext {
    const result: TemplateContext = {};
    const value = this.getValue(obj, prefix);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[`${prefix}.${key}`] = val as string | number | boolean;
      }
    }

    return result;
  }
}

export function renderTemplate(template: string, context: TemplateContext, options?: TemplateRenderOptions): string {
  const renderer = new TemplateRenderer(options);
  return renderer.renderMustache(template, context);
}

function getValue(obj: TemplateContext, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object" && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  const regex = /\{\{(\w+(?:\.\w+)*)\}\}/g;
  let match;

  while ((match = regex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

export function validateTemplate(template: string, context: TemplateContext): { valid: boolean; missing: string[] } {
  const variables = extractTemplateVariables(template);
  const missing: string[] = [];

  for (const variable of variables) {
    const value = getValue(context, variable);
    if (value === undefined || value === null) {
      missing.push(variable);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
