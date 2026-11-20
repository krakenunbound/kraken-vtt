import { useEffect, useState } from "react";

// A field to type in: kept while typing, sent when it is left (or Enter).
// The core's one text/number field (FG's stringfield/numberfield): every
// sheet and part uses it, and its label is the aria-label the tests and the
// agent select by.
export function Field({ value, onSave, number = false, editable, label, wide = false, area = false, className = "" }: { value: unknown; onSave: (value: string) => void; number?: boolean; editable: boolean; label?: string; wide?: boolean; area?: boolean; className?: string }) {
  const shown = value === undefined || value === null ? "" : String(value);
  const [text, setText] = useState(shown);
  const [typing, setTyping] = useState(false);
  // Changed by the user since it took the cursor: only then is it saved (a field merely holding the cursor
  // never writes its old number back over damage the GM applied meanwhile).
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!typing || !edited) setText(shown);
  }, [shown, typing, edited]);
  const commit = () => {
    setTyping(false);
    setEdited(false);
    if (!edited || text === shown) return setText(shown);
    if (number) {
      // "1,200" is 1200; anything that is not a number ("12gp") puts the old value back rather than saving 0.
      const plain = /^\s*-?\d{1,3}(,\d{3})+(\.\d+)?\s*$/.test(text) ? text.replace(/,/g, "") : text.trim();
      if (plain !== "" && !Number.isFinite(Number(plain))) return setText(shown);
      if (plain !== shown) onSave(plain);
      return;
    }
    onSave(text);
  };
  const common = {
    className: `cc-field${number ? " number" : ""}${wide ? " wide" : ""} ${className}`,
    value: text,
    readOnly: !editable,
    "aria-label": label,
    title: label,
    onFocus: () => setTyping(true),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setEdited(true);
      setText(event.target.value);
    },
    onBlur: commit,
  };
  // An empty text box says what it is for (the sheet's notes, a bond, a spellbook).
  return area ? <textarea {...common} placeholder={editable ? label : undefined} /> : <input {...common} inputMode={number ? "numeric" : undefined} onKeyDown={(event) => event.key === "Enter" && !event.nativeEvent.isComposing && (event.target as HTMLInputElement).blur()} />;
}
