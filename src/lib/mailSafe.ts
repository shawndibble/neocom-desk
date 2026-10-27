/** EVE renders mail as limited HTML: a name or free text must not bring tags of its own. */
export const mailSafe = (text: string) => text.replace(/[<>]/g, '');
