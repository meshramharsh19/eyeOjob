const nodemailer = require('nodemailer');
const env = require('./env');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: env.mail.user,
    pass: env.mail.pass, // Gmail App Password
  },
});

// ──────────────────────────────────────────────
// ✏️ CUSTOMISE YOUR EMAIL TEMPLATE HERE
// ──────────────────────────────────────────────
const sendOtpEmail = async (toEmail, userName, otp) => {
  const mailOptions = {
    from: `"EyeOJob" <${env.mail.user}>`,   // ✏️ Change sender name here
    to: toEmail,
    subject: '🔐 Your eyeOjob Verification Code',    // ✏️ Change subject here

    // ✏️ Change plain text version here (for email clients that don't support HTML)
    text: `Hi ${userName}, your OTP is ${otp}. It expires in 10 minutes.`,

    // ✏️ Change HTML email design here ↓↓↓
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #F8FAFC; padding: 32px 16px;">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1E3A8A, #2563EB, #06B6D4); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
          <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800;">EyeOJob</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Keep an Eye on Every Opportunity You Apply</p>
        </div>

        <!-- Body -->
        <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

          <h2 style="color: #0F172A; font-size: 20px; margin: 0 0 8px;">Hey ${userName} 👋</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            Here's your one-time verification code to complete your registration:
          </p>

          <!-- OTP Box -->
          <div style="background: #EFF6FF; border: 2px dashed #2563EB; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748B; font-size: 13px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
            <h1 style="color: #2563EB; font-size: 42px; font-weight: 800; margin: 0; letter-spacing: 12px;">${otp}</h1>
            <p style="color: #94A3B8; font-size: 12px; margin: 8px 0 0;">⏰ Expires in 10 minutes</p>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            If you didn't create an account on eyeOjob, you can safely ignore this email.
          </p>

          <!-- Divider -->
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />

          <!-- Footer -->
          <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
            🔒 This email was sent by EyeOJob · Never share your OTP with anyone
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// ──────────────────────────────────────────────
// ✏️ RESET PASSWORD OTP EMAIL — CUSTOMISE HERE
// ──────────────────────────────────────────────
const sendResetOtpEmail = async (toEmail, userName, otp) => {
  const mailOptions = {
    from: `"EyeOJob" <${env.mail.user}>`,
    to: toEmail,
    subject: '🔑 Your EyeOJob Password Reset OTP',

    text: `Hi ${userName}, your password reset OTP is ${otp}. It expires in 5 minutes.`,

    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #F8FAFC; padding: 32px 16px;">
        <div style="background: linear-gradient(135deg, #1E3A8A, #2563EB, #06B6D4); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
          <h1 style="color: white; font-size: 28px; margin: 0; font-weight: 800;">EyeOJob</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Password Reset Request</p>
        </div>

        <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <h2 style="color: #0F172A; font-size: 20px; margin: 0 0 8px;">Hey ${userName} 👋</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            Use the OTP below to reset your password:
          </p>

          <div style="background: #EFF6FF; border: 2px dashed #2563EB; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #64748B; font-size: 13px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
            <h1 style="color: #2563EB; font-size: 42px; font-weight: 800; margin: 0; letter-spacing: 12px;">${otp}</h1>
            <p style="color: #94A3B8; font-size: 12px; margin: 8px 0 0;">⏰ Expires in 5 minutes</p>
          </div>

          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
            If you didn't request a password reset, you can safely ignore this email — your password won't change.
          </p>

          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0;" />

          <p style="color: #94A3B8; font-size: 12px; text-align: center; margin: 0;">
            🔒 Never share your OTP with anyone
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail, sendResetOtpEmail };
