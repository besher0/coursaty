import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ApiCodeException } from '@/common/errors/api-code.exception';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { StudentsController } from '@/modules/students/controllers/students.controller';
import { StudentsService } from '@/modules/students/services/students.service';
import { CourseInterestsService } from '@/modules/students/services/course-interests.service';
import { SubscriptionRequestsController } from './subscription-requests.controller';
import { FinancialsService } from '../services/financials.service';
import { UploadsService } from '@/modules/uploads/uploads.service';

const COURSE_ID = '2c52d3ca-86d3-4103-ab02-709bc320f8ec';
const STUDENT_ID = 'student-local-1';
const ADMIN_ID = 'admin-local-1';

type LocalUser = { userId: string; type: 'STUDENT' | 'ADMIN' };

class LocalSubscriptionState {
  course = {
    id: COURSE_ID,
    name: 'دورات برمجة 3',
    price: 700,
    discountedPrice: 700,
    isFree: false,
    expiresAt: new Date('2099-09-28T00:00:00.000Z'),
    paymentQrUrl: 'https://local.test/qr.png',
  };
  interest: any = null;
  pending: any = null;
  active = false;
  failNextCreate = false;
  requestCounter = 0;
}

class LocalCourseInterestsService {
  constructor(private readonly state: LocalSubscriptionState) {}

  saveInterest(user: LocalUser, courseId: string, source: string) {
    this.assertStudent(user);
    if (courseId !== this.state.course.id) throw new ApiCodeException(404, 'COURSE_NOT_FOUND', 'not found');
    this.assertEligible();
    if (this.state.active) throw new ApiCodeException(409, 'ACTIVE_SUBSCRIPTION_EXISTS', 'already active');
    if (this.state.pending) {
      throw new ApiCodeException(409, 'SUBSCRIPTION_REQUEST_ALREADY_PENDING', 'already pending');
    }
    this.state.interest ??= {
      id: 'interest-local-1',
      courseId,
      source,
      course: this.courseView(),
    };
    this.state.interest.source = source;
    return { interest: this.state.interest };
  }

  listInterests(user: LocalUser) {
    this.assertStudent(user);
    return { interests: this.state.interest ? [{ ...this.state.interest, pendingRequest: this.state.pending }] : [] };
  }

  deleteInterest(user: LocalUser, courseId: string) {
    this.assertStudent(user);
    if (this.state.pending) throw new ApiCodeException(409, 'INTEREST_HAS_PENDING_REQUEST', 'pending');
    if (courseId === this.state.course.id) this.state.interest = null;
    return { deleted: true };
  }

  private assertStudent(user: LocalUser) {
    if (user.type !== 'STUDENT') throw new ApiCodeException(401, 'UNAUTHENTICATED', 'student only');
  }

  private assertEligible() {
    const finalPrice = this.state.course.discountedPrice;
    if (
      this.state.course.isFree ||
      finalPrice <= 0 ||
      this.state.course.expiresAt.getTime() <= Date.now()
    ) {
      throw new ApiCodeException(403, 'COURSE_NOT_AVAILABLE_FOR_SUBSCRIPTION', 'not eligible');
    }
    if (!this.state.course.paymentQrUrl) {
      throw new ApiCodeException(400, 'COURSE_PAYMENT_QR_MISSING', 'missing qr');
    }
  }

  private courseView() {
    return {
      id: this.state.course.id,
      name: this.state.course.name,
      basePrice: this.state.course.price,
      discountedPrice: this.state.course.discountedPrice,
      isFree: this.state.course.isFree,
      isExpired: this.state.course.expiresAt.getTime() <= Date.now(),
      paymentQrUrl: this.state.course.paymentQrUrl,
    };
  }
}

class LocalFinancialsService {
  constructor(private readonly state: LocalSubscriptionState) {}

  assertSubscribableCourse(user: LocalUser, courseId: string) {
    if (user.type !== 'STUDENT') throw new ApiCodeException(401, 'UNAUTHENTICATED', 'student only');
    if (courseId !== this.state.course.id) throw new ApiCodeException(404, 'COURSE_NOT_FOUND', 'not found');
    if (this.state.course.isFree || this.state.course.discountedPrice <= 0 ||
        this.state.course.expiresAt.getTime() <= Date.now()) {
      throw new ApiCodeException(403, 'COURSE_NOT_AVAILABLE_FOR_SUBSCRIPTION', 'not eligible');
    }
    if (!this.state.course.paymentQrUrl) throw new ApiCodeException(400, 'COURSE_PAYMENT_QR_MISSING', 'missing qr');
    if (this.state.active) throw new ApiCodeException(409, 'ACTIVE_SUBSCRIPTION_EXISTS', 'already active');
    if (this.state.pending) throw new ApiCodeException(409, 'SUBSCRIPTION_REQUEST_ALREADY_PENDING', 'already pending');
    return { studentId: STUDENT_ID, course: this.state.course };
  }

  createSubscriptionRequest(user: LocalUser, dto: any) {
    this.assertSubscribableCourse(user, dto.courseId);
    if (this.state.failNextCreate) {
      this.state.failNextCreate = false;
      throw new Error('simulated request persistence failure');
    }
    this.state.pending = {
      id: `00000000-0000-4000-8000-${String(++this.state.requestCounter).padStart(12, '0')}`,
      courseId: dto.courseId,
      status: 'PENDING',
      receiptUrl: dto.receiptUrl,
      note: dto.note ?? null,
    };
    return this.state.pending;
  }

  approveSubscriptionRequest(id: string, user: LocalUser) {
    if (user.type !== 'ADMIN' || user.userId !== ADMIN_ID) throw new ApiCodeException(403, 'FORBIDDEN', 'admin only');
    if (!this.state.pending || this.state.pending.id !== id) throw new ApiCodeException(404, 'NOT_FOUND', 'not found');
    this.state.pending.status = 'APPROVED';
    this.state.active = true;
    this.state.interest = null;
    const result = this.state.pending;
    this.state.pending = null;
    return { subscriptionRequest: result, subscription: { courseId: COURSE_ID, active: true } };
  }

  rejectSubscriptionRequest(id: string, user: LocalUser, dto: any) {
    if (user.type !== 'ADMIN' || user.userId !== ADMIN_ID) throw new ApiCodeException(403, 'FORBIDDEN', 'admin only');
    if (!this.state.pending || this.state.pending.id !== id) throw new ApiCodeException(404, 'NOT_FOUND', 'not found');
    this.state.pending.status = 'REJECTED';
    this.state.pending.adminNote = dto.adminNote;
    this.state.interest = null;
    const result = this.state.pending;
    this.state.pending = null;
    return result;
  }
}

class LocalUploadsService {
  readonly deleted: string[] = [];
  private counter = 0;

  uploadSubscriptionReceipt(file: any) {
    if (!file?.buffer?.length || file.buffer.length > 5 * 1024 * 1024) {
      throw new ApiCodeException(400, 'INVALID_RECEIPT_FILE', 'invalid file');
    }
    const png = file.buffer[0] === 0x89 && file.buffer[1] === 0x50 && file.buffer[2] === 0x4e && file.buffer[3] === 0x47;
    const jpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
    if (!png && !jpeg) throw new ApiCodeException(400, 'INVALID_RECEIPT_FILE', 'invalid file');
    const storagePath = `uploads/subscription-receipts/local-${++this.counter}.png`;
    return {
      storagePath,
      fileUrl: `https://local.test/${storagePath}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  deleteSubscriptionReceipt(storagePath: string) {
    this.deleted.push(storagePath);
  }
}

describe('local QR receipt subscription flow', () => {
  let app: INestApplication;
  let state: LocalSubscriptionState;
  let uploads: LocalUploadsService;

  beforeEach(async () => {
    state = new LocalSubscriptionState();
    uploads = new LocalUploadsService();
    const interests = new LocalCourseInterestsService(state);
    const financials = new LocalFinancialsService(state);
    const moduleRef = await Test.createTestingModule({
      controllers: [StudentsController, SubscriptionRequestsController],
      providers: [
        { provide: StudentsService, useValue: { create: jest.fn() } },
        { provide: CourseInterestsService, useValue: interests },
        { provide: FinancialsService, useValue: financials },
        { provide: UploadsService, useValue: uploads },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = req.headers['x-test-role'] === 'ADMIN'
            ? { userId: ADMIN_ID, type: 'ADMIN' }
            : { userId: STUDENT_ID, type: 'STUDENT' };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it('completes interest -> receipt -> pending -> approval -> active flow', async () => {
    const student = request(app.getHttpServer());
    const admin = () => request(app.getHttpServer());
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await student
      .post(`/students/me/course-interests/${COURSE_ID}`)
      .send({ source: 'MANUAL' })
      .expect(201);
    await student.get('/students/me/course-interests').expect(200).expect(({ body }) => {
      expect(body.interests).toHaveLength(1);
      expect(body.interests[0].course.name).toBe('دورات برمجة 3');
    });

    state.failNextCreate = true;
    await student
      .post('/financials/subscription-requests/with-receipt')
      .field('courseId', COURSE_ID)
      .field('note', 'force-fail')
      .attach('file', png, { filename: 'failed.png', contentType: 'image/png' })
      .expect(500);
    expect(uploads.deleted).toHaveLength(1);

    const receipt = await student
      .post('/financials/subscription-requests/with-receipt')
      .field('courseId', COURSE_ID)
      .field('note', 'دفعة اختبار محلي')
      .attach('file', png, { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);
    expect(receipt.body.subscriptionRequest.status).toBe('PENDING');

    await student
      .post('/financials/subscription-requests/with-receipt')
      .field('courseId', COURSE_ID)
      .attach('file', png, { filename: 'duplicate.png', contentType: 'image/png' })
      .expect(409);
    expect(uploads.deleted).toHaveLength(1);

    await student.get('/students/me/course-interests').expect(200).expect(({ body }) => {
      expect(body.interests[0].pendingRequest.status).toBe('PENDING');
    });
    await admin()
      .patch(`/financials/subscription-requests/${receipt.body.subscriptionRequest.id}/approve`)
      .set('x-test-role', 'ADMIN')
      .send({})
      .expect(200);
    expect(state.active).toBe(true);
    await student.get('/students/me/course-interests').expect(200).expect(({ body }) => {
      expect(body.interests).toHaveLength(0);
    });
    await student
      .post(`/students/me/course-interests/${COURSE_ID}`)
      .send({ source: 'MANUAL' })
      .expect(409);
  });

  it('rejects ineligible courses, bad files, and removes interest on rejection', async () => {
    const student = request(app.getHttpServer());
    const admin = () => request(app.getHttpServer());
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    state.course.price = 0;
    state.course.discountedPrice = 0;
    await student
      .post(`/students/me/course-interests/${COURSE_ID}`)
      .send({ source: 'MANUAL' })
      .expect(403);
    state.course.price = 700;
    state.course.discountedPrice = 700;
    await student
      .post(`/students/me/course-interests/${COURSE_ID}`)
      .send({ source: 'MANUAL' })
      .expect(201);
    await student
      .post('/financials/subscription-requests/with-receipt')
      .field('courseId', COURSE_ID)
      .attach('file', Buffer.from('not-an-image'), { filename: 'receipt.txt', contentType: 'text/plain' })
      .expect(400);
    const receipt = await student
      .post('/financials/subscription-requests/with-receipt')
      .field('courseId', COURSE_ID)
      .attach('file', png, { filename: 'receipt.png', contentType: 'image/png' })
      .expect(201);
    await admin()
      .patch(`/financials/subscription-requests/${receipt.body.subscriptionRequest.id}/reject`)
      .set('x-test-role', 'ADMIN')
      .send({ adminNote: 'إيصال تجريبي مرفوض' })
      .expect(200);
    await student.get('/students/me/course-interests').expect(200).expect(({ body }) => {
      expect(body.interests).toHaveLength(0);
    });
  });
});
