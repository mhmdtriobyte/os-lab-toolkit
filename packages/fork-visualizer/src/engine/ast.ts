export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!='
  | '&'
  | '|'
  | '^'
  | '<<'
  | '>>';

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' | '<<=' | '>>=';

export type Expr =
  | { k: 'num'; value: number; line: number }
  | { k: 'str'; value: string; line: number }
  | { k: 'var'; name: string; line: number }
  | { k: 'assign'; op: AssignOp; name: string; value: Expr; line: number }
  | { k: 'incdec'; op: '++' | '--'; prefix: boolean; name: string; line: number }
  | { k: 'unary'; op: '-' | '+' | '!' | '~'; arg: Expr; line: number }
  | { k: 'binary'; op: BinaryOp; left: Expr; right: Expr; line: number }
  | { k: 'logical'; op: '&&' | '||'; left: Expr; right: Expr; line: number }
  | { k: 'cond'; test: Expr; then: Expr; else: Expr; line: number }
  | { k: 'call'; name: string; args: Expr[]; line: number }
  | { k: 'addr'; name: string; line: number };

export interface Declarator {
  name: string;
  init?: Expr;
  line: number;
}

export type Stmt =
  | { k: 'decl'; decls: Declarator[]; line: number }
  | { k: 'expr'; expr: Expr; line: number }
  | { k: 'if'; test: Expr; then: Stmt; else?: Stmt; line: number }
  | { k: 'while'; test: Expr; body: Stmt; line: number }
  | { k: 'dowhile'; body: Stmt; test: Expr; line: number }
  | { k: 'for'; init?: Stmt; test?: Expr; update?: Expr; body: Stmt; line: number }
  | { k: 'block'; body: Stmt[]; line: number }
  | { k: 'return'; value?: Expr; line: number }
  | { k: 'break'; line: number }
  | { k: 'continue'; line: number }
  | { k: 'empty'; line: number };

export interface FuncDecl {
  name: string;
  returnsVoid: boolean;
  params: string[];
  body: Stmt & { k: 'block' };
  line: number;
}

export interface ProgramAst {
  globals: Declarator[];
  functions: FuncDecl[];
}
