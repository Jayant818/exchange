import { Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import * as jwt from "jsonwebtoken";

export async function sendLoginMail(
  email: string,
  token: string,
  transporter: Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >,
  message: { to: string; subject: string; html: string }
) {
  try {
    let htmlBody = `Click <a href="http://localhost:3001/verify?id=${token}">here</a> to verify your email.`;
    message.html = htmlBody;
    message.to = email;

    transporter.sendMail(message, (err: any, info: any) => {
      if (err) {
        console.log("Error occurred");
        console.log(err.message);
        return;
      }
      console.log("Message sent successfully!");
      console.log('Server responded with "%s"', info.response);
    });
  } catch (e) {
    console.log("Error occurred while sending email");
    console.log(e);
  }
}

export function createToken(email: string) {
  const secret = process.env.TOKEN_SECRET;

  if (!secret || secret === undefined) {
    return null;
  }

  const token = jwt.sign({ email }, secret!, {
    expiresIn: "1h",
  });

  return token;
}
