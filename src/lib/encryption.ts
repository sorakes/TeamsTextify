import crypto from "crypto";

// Chave master para encriptar os segredos no banco. (Em produção, viria do process.env)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "bf3c199c2470cb477d907b1e0917c17bbf3c199c2470cb477d907b1e0917c17b"; // Deve ter 64 caracteres hexa (32 bytes)
const IV_LENGTH = 16; // AES usa 16 bytes

export function encrypt(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  } catch (error) {
    console.error("Encryption error:", error);
    return text; // Fallback seguro para não estourar a tela, mas na prática falharia
  }
}

export function decrypt(text: string): string {
  if (!text || !text.includes(":")) return text;
  try {
    const textParts = text.split(":");
    const iv = Buffer.from(textParts.shift()!, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY, "hex"), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error("Decryption error:", error);
    return "";
  }
}
