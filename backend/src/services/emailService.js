const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const { generateUnsubscribeToken } = require('../utils/jwt');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    // Resend HTTP API — uses port 443, never blocked by cloud hosting providers.
    // SMTP (port 587) is blocked on Render/AWS/GCP to prevent spam abuse.
    this.configured = !!process.env.RESEND_API_KEY;

    if (this.configured) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    // onboarding@resend.dev is Resend's verified sandbox sender — works on free
    // tier without domain verification. Set EMAIL_FROM to override once you have
    // a verified custom domain in Resend.
    this.from = process.env.EMAIL_FROM || 'TaskBoard <onboarding@resend.dev>';

    this.clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    this.templateCache = {};
  }

  async verify() {
    if (!this.configured) {
      logger.warn('Email not configured — RESEND_API_KEY not set. All emails will be skipped.');
      return false;
    }
    try {
      // Validate the API key by fetching the domains list (lightweight check)
      await this.resend.domains.list();
      logger.info('Email service ready (Resend HTTP API)', { from: this.from });
      return true;
    } catch (err) {
      logger.error('Email service failed to connect — emails will not be sent', {
        error: err.message,
        hint: 'Check RESEND_API_KEY is correct at resend.com/api-keys',
      });
      return false;
    }
  }

  getTemplate(name) {
    if (this.templateCache[name]) return this.templateCache[name];
    const filePath = path.join(__dirname, '../templates', `${name}.html`);
    const template = fs.readFileSync(filePath, 'utf8');
    this.templateCache[name] = template;
    return template;
  }

  renderTemplate(templateName, variables) {
    let html = this.getTemplate(templateName);
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value ?? '');
    }
    return html;
  }

  getUnsubscribeUrl(userId) {
    try {
      const token = generateUnsubscribeToken(userId);
      return `${this.clientUrl}/api/auth/unsubscribe?token=${token}`;
    } catch {
      // UNSUBSCRIBE_SECRET not set — return settings page as safe fallback
      return `${this.clientUrl}/settings`;
    }
  }

  async send({ to, subject, html }) {
    if (!this.configured) {
      logger.warn('Email skipped — RESEND_API_KEY not configured', { to, subject });
      return null;
    }
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });
      if (error) throw new Error(error.message);
      logger.info('Email sent', { to, subject, messageId: data?.id });
      return data;
    } catch (err) {
      logger.error('Email send failed', { to, subject, error: err.message });
      throw err;
    }
  }

  async sendBoardInviteNewUser({ email, inviterName, boardName, role, inviteToken }) {
    const html = this.renderTemplate('board-invite-new-user', {
      inviterName,
      boardName,
      role,
      joinUrl: `${this.clientUrl}/join?token=${inviteToken}`,
    });
    return this.send({ to: email, subject: `${inviterName} invited you to "${boardName}" on TaskBoard`, html });
  }

  async sendBoardInvite({ email, name, boardName, inviterName, role, userId, inviteToken }) {
    const html = this.renderTemplate('board-invite', {
      name,
      boardName,
      inviterName,
      role,
      joinUrl: `${this.clientUrl}/join?token=${inviteToken}`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `${inviterName} invited you to "${boardName}" on TaskBoard`, html });
  }

  async sendCardAssigned({ email, name, cardName, boardName, assignerName, boardId, cardId, userId }) {
    const html = this.renderTemplate('card-assigned', {
      name,
      cardName,
      boardName,
      assignerName,
      cardUrl: `${this.clientUrl}/board/${boardId}?card=${cardId}`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `You were assigned to "${cardName}"`, html });
  }

  async sendDueDateReminder({ email, name, cardName, boardId, cardId, dueDate, userId }) {
    const html = this.renderTemplate('due-date-reminder', {
      name,
      cardName,
      dueDate: new Date(dueDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      cardUrl: `${this.clientUrl}/board/${boardId}?card=${cardId}`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `Due tomorrow: "${cardName}"`, html });
  }

  async sendCardMoved({ email, name, cardName, listName, boardId, userId }) {
    const html = this.renderTemplate('card-moved', {
      name,
      cardName,
      listName,
      boardUrl: `${this.clientUrl}/board/${boardId}`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `Card "${cardName}" was moved`, html });
  }

  async sendActivityUpdate({ email, name, cardName, actorName, action, boardId, userId }) {
    const html = this.renderTemplate('activity-update', {
      name,
      cardName,
      actorName,
      action,
      boardUrl: `${this.clientUrl}/board/${boardId}`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `Activity on "${cardName}"`, html });
  }

  async sendRoleChanged({ email, name, boardName, newRole, userId }) {
    const html = this.renderTemplate('role-changed', {
      name,
      boardName,
      newRole,
      boardUrl: `${this.clientUrl}/dashboard`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: `Your role in "${boardName}" has changed`, html });
  }

  async sendWelcome({ email, name, userId }) {
    const html = this.renderTemplate('welcome', {
      name,
      dashboardUrl: `${this.clientUrl}/dashboard`,
      unsubscribeUrl: this.getUnsubscribeUrl(userId),
    });
    return this.send({ to: email, subject: 'Welcome to TaskBoard!', html });
  }

  async sendPasswordReset({ email, name, resetToken }) {
    const html = this.renderTemplate('reset-password', {
      name,
      resetUrl: `${this.clientUrl}/reset-password?token=${resetToken}`,
    });
    return this.send({ to: email, subject: 'Reset your TaskBoard password', html });
  }
}

module.exports = new EmailService();
