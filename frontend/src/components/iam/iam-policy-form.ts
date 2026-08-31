/** Supported MVP IAM action names (mirrors backend iam-policy.types). */
export const IAM_ACTIONS = [
  's3:GetObject',
  's3:PutObject',
  's3:DeleteObject',
  's3:ListBucket',
  's3:*',
] as const;

/** One selectable IAM action in the policy form. */
export type IamActionOption = (typeof IAM_ACTIONS)[number];

/** Editable statement row in the structured policy form. */
export type StatementFormRow = {
  sid: string;
  effect: 'Allow' | 'Deny';
  actions: string[];
  resources: string[];
};

/** Structured create/edit form state for one IAM policy. */
export type IamPolicyFormState = {
  name: string;
  statements: StatementFormRow[];
};

/**
 * Returns a blank statement with sensible defaults.
 * @returns Default Allow + GetObject statement row
 */
export function emptyStatement(): StatementFormRow {
  return {
    sid: '',
    effect: 'Allow',
    actions: ['s3:GetObject'],
    resources: ['arn:lv-s3:::my-bucket/*'],
  };
}

/**
 * Converts a stored policy document into structured form state.
 * @param name - Policy name
 * @param document - Parsed policy document from the API
 * @returns Form state for the dialog
 */
export function documentToForm(name: string, document: Record<string, unknown>): IamPolicyFormState {
  const rawStatements = document.Statement;
  if (!Array.isArray(rawStatements) || rawStatements.length === 0) {
    return { name, statements: [emptyStatement()] };
  }

  const statements = rawStatements.map((raw) => {
    const s = raw as Record<string, unknown>;
    const actions = Array.isArray(s.Action)
      ? s.Action.map(String)
      : s.Action != null
        ? [String(s.Action)]
        : [];
    const resources = Array.isArray(s.Resource)
      ? s.Resource.map(String)
      : s.Resource != null
        ? [String(s.Resource)]
        : [''];
    return {
      sid: typeof s.Sid === 'string' ? s.Sid : '',
      effect: s.Effect === 'Deny' ? ('Deny' as const) : ('Allow' as const),
      actions,
      resources: resources.length > 0 ? resources : [''],
    };
  });

  return { name, statements };
}

/**
 * Builds an IAM policy document object from structured form state.
 * @param state - Current form values
 * @returns Policy document suitable for create/update API bodies
 */
export function formToDocument(state: IamPolicyFormState): Record<string, unknown> {
  return {
    Version: '2012-10-17',
    Statement: state.statements.map((s) => {
      const resources = s.resources.map((r) => r.trim()).filter(Boolean);
      const stmt: Record<string, unknown> = {
        Effect: s.effect,
        Action: s.actions.length === 1 ? s.actions[0] : s.actions,
        Resource: resources.length === 1 ? resources[0] : resources,
      };
      if (s.sid.trim()) {
        stmt.Sid = s.sid.trim();
      }
      return stmt;
    }),
  };
}

/**
 * Validates structured form state before submit.
 * @param state - Form values
 * @returns Error message or empty string when valid
 */
export function validatePolicyForm(state: IamPolicyFormState): string {
  if (!state.name.trim()) {
    return 'Policy name is required';
  }
  if (state.statements.length === 0) {
    return 'At least one statement is required';
  }
  for (let i = 0; i < state.statements.length; i += 1) {
    const s = state.statements[i];
    if (s.actions.length === 0) {
      return `Statement ${i + 1}: select at least one action`;
    }
    const resources = s.resources.map((r) => r.trim()).filter(Boolean);
    if (resources.length === 0) {
      return `Statement ${i + 1}: add at least one resource ARN`;
    }
  }
  return '';
}

/**
 * Parses advanced JSON mode input into a policy document.
 * @param jsonText - Raw JSON string from the textarea
 * @returns Parsed document object
 * @throws Error when JSON is invalid or missing Statement array
 */
export function parseAdvancedDocument(jsonText: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Invalid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Policy document must be a JSON object');
  }
  const doc = parsed as Record<string, unknown>;
  if (!Array.isArray(doc.Statement) || doc.Statement.length === 0) {
    throw new Error('Statement must be a non-empty array');
  }
  return doc;
}
