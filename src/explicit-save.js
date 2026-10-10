export async function chooseSaveTarget(name) {
  if (!window.showSaveFilePicker) throw new Error('保存先を選択できません。Windows版EdgeまたはChromeで開いてください。ファイルは保存していません。');
  try {
    const extension = '.' + name.split('.').pop();
    return await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'WebROMS ' + extension, accept: { 'application/octet-stream': [extension] } }] });
  } catch (error) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}

export async function writeToTarget(target, data) {
  if (!target) return false;
  const writer = await target.createWritable();
  try { await writer.write(data); await writer.close(); }
  catch (error) { try { await writer.abort(); } catch {} throw error; }
  return true;
}

export const settingsJson = value => JSON.stringify(value, (_, item) => ArrayBuffer.isView(item) ? Array.from(item) : item, 2);
