import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, SAFE_USER } from './auth.service.js';
import {
  GOOGLE_VERIFIER,
  type GoogleProfile,
  type GoogleVerifier,
} from './google.js';
import { hashPassword } from './password.js';

const LOGIN_FIELDS = { ...SAFE_USER, sessionVersion: true, deletedAt: true };

// A password nobody knows: an account made with Google can't be logged into with a
// password until its owner sets one through the reset link (that proves the email)
const unusablePassword = () =>
  hashPassword(randomBytes(32).toString('base64url'));

// "Continue with Google" (KAN-95). The browser gets an ID token from Google; the API
// checks it, then finds or makes the account and logs in through the same path as a
// password (so two-step login and deleted accounts work the same way).
@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional()
    @Inject(GOOGLE_VERIFIER)
    private readonly verifier: GoogleVerifier | null = null,
  ) {}

  // For the web app: null hides the button
  get clientId() {
    return this.verifier?.clientId ?? null;
  }

  async login(credential: string) {
    if (!this.verifier)
      throw new NotFoundException('Google sign-in is not set up');
    let google: GoogleProfile;
    try {
      google = await this.verifier.verify(credential);
    } catch {
      throw new UnauthorizedException('Google sign-in failed. Try again.');
    }
    // Only an email Google has checked may make or join an account
    if (!google.emailVerified)
      throw new UnauthorizedException(
        'Your Google account email is not verified',
      );

    const user = await this.findOrCreate(google);
    if (user.deletedAt)
      throw new UnauthorizedException('This account has been deleted');
    const { deletedAt: _gone, ...found } = user;
    return this.auth.startLogin(found);
  }

  private async findOrCreate(google: GoogleProfile) {
    const linked = await this.prisma.user.findUnique({
      where: { googleId: google.sub },
      select: LOGIN_FIELDS,
    });
    if (linked) return linked;

    const sameEmail = await this.prisma.user.findUnique({
      where: { email: google.email },
      select: { id: true, emailVerifiedAt: true, deletedAt: true },
    });
    if (!sameEmail)
      return this.prisma.user.create({
        data: {
          email: google.email,
          googleId: google.sub,
          displayName: google.name.slice(0, 50),
          emailVerifiedAt: new Date(), // Google checked it
          passwordHash: await unusablePassword(),
          hasPassword: false,
        },
        select: LOGIN_FIELDS,
      });
    if (sameEmail.deletedAt)
      throw new UnauthorizedException('This account has been deleted');

    // An account with this email already exists. If its owner never proved the
    // email, whoever made it may not own it: someone could sign up with your email
    // first, wait for you to use Google, and then log in with their password. So the
    // unproved account is taken over cleanly: the old password, logins and two-step
    // login are all removed before Google is linked.
    if (!sameEmail.emailVerifiedAt) {
      const userId = sameEmail.id;
      const [linkedUser] = await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: {
            googleId: google.sub,
            emailVerifiedAt: new Date(),
            passwordHash: await unusablePassword(),
            hasPassword: false,
            sessionVersion: { increment: 1 },
            mfaSecret: null,
            mfaEnabledAt: null,
            mfaLastStep: null,
          },
          select: LOGIN_FIELDS,
        }),
        this.prisma.session.deleteMany({ where: { userId } }),
        this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
        this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      ]);
      return linkedUser;
    }
    // The owner proved the email before: Google proves it again, so link them
    return this.prisma.user.update({
      where: { id: sameEmail.id },
      data: { googleId: google.sub },
      select: LOGIN_FIELDS,
    });
  }
}
