import { useEffect, useState } from "react";

// A field to type in: kept while typing, sent when it is left (or Enter).
// The core's one text/number field (FG's stringfield/numberfield): every
// sheet and part uses it, and its label is the aria-label the tests and the
// agent select by.
export function Field({ value, onSave, number = false, editable, label, wide = false, area = false, className = "" }: { value: unknown; onSave: (value: string) => void; number?: boolean; editable: boolean; label?: string; wide?: boolean; area?: boolean; className?: string }) {
  const shown = value === undefined || value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) setText(shown);
  }, [shown, typing]);
  const commit = () => {
    setTyping(false);
    if (text !== shown) onSave(text);
  };
  const common = {
    className: `cc-field${number ? " number" : ""}${wide ? " wide" : ""} ${className}`,
    value: text,
    readOnly: !editable,
    "aria-label": label,
    title: label,
    onFocus: () => setTyping(true),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setText(event.target.value),
    onBlur: commit,
  };
  // An empty text box says what it is for (the sheet's notes, a bond, a spellbook).
  return area ? <textarea {...common} placeholder={editable ? label : undefined} /> : <input {...common} inputMode={number ? "numeric" : undefined} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()} />;
}
