import type { ReactNode } from "react";

type ToolbarProps = {
  actions?: ReactNode;
  children?: ReactNode;
  title: string;
};

export function Toolbar({ actions, children, title }: ToolbarProps) {
  return (
    <header className="toolbar">
      <div>
        <h1>{title}</h1>
        {children ? <div className="toolbar__filters">{children}</div> : null}
      </div>
      {actions ? <div className="toolbar__actions">{actions}</div> : null}
    </header>
  );
}
