// Whether a campaign's saved table map may come back when it is hosted again.
// A map from a book comes back only while that book is active in the
// campaign (an inactive book's maps are off limits); a map the GM opened from
// their own picture or bundle file always does. The saved adventure is the
// book's name, or (made before Kraken named it) its file's whole path, with
// Windows' backslashes or forward slashes.
export function bookTail(adventure) {
  const last = String(adventure ?? "").split(/[\\/]/).pop() ?? "";
  return last.replace(/\.(mod|kpack|zip)$/i, "");
}

export function restoreAllowed(view, books) {
  if (!view) return true;
  const adventure = String(view.adventure ?? "");
  const tail = bookTail(adventure);
  const names = (book) => [book.id, book.name, book.title];
  const book = (books ?? []).find((item) => names(item).includes(adventure) || names(item).includes(tail));
  // A book's map: a book matched, its scene is a book map's (fg-...), or it names a book's file.
  const fromBook = Boolean(book) || /^fg-/.test(String(view.sceneId ?? "")) || /\.(mod|kpack)$/i.test(adventure);
  return !fromBook || Boolean(book?.active);
}
