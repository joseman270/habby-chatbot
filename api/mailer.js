const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '';

let transporter = null;

function isMailConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getTransporter() {
  if (!isMailConfigured()) {
    throw new Error('SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  return transporter;
}

async function sendAppointmentConfirmation({ to, leadName, startsAt, channel }) {
  const transport = getTransporter();
  const localDate = new Date(startsAt).toLocaleString('es-PE', { timeZone: 'America/Lima' });
  const subject = 'Confirmacion de cita - Habita Peru';
  const text = [
    `Hola ${leadName || ''},`,
    '',
    'Tu cita ha sido registrada con exito.',
    `Fecha y hora: ${localDate} (Lima)`,
    `Canal: ${channel}`,
    '',
    'Gracias por confiar en Habita Peru.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">
      <h2 style="margin:0 0 12px">Cita confirmada</h2>
      <p>Hola ${leadName || ''}, tu cita fue registrada con exito.</p>
      <ul>
        <li><strong>Fecha y hora:</strong> ${localDate} (Lima)</li>
        <li><strong>Canal:</strong> ${channel}</li>
      </ul>
      <p>Gracias por confiar en Habita Peru.</p>
    </div>
  `;

  const info = await transport.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html,
  });

  return { messageId: info.messageId };
}

module.exports = {
  isMailConfigured,
  sendAppointmentConfirmation,
};
