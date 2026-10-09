import { BadRequestException } from '@nestjs/common';
import { LecturesService } from './lectures.service';

describe('LecturesService media links and question ordering', () => {
  it('returns safe video metadata without playback URLs when listing lectures', async () => {
    const prisma = {
      lecture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lecture-1',
            videos: [
              {
                id: 'video-1',
                videoUrl: 'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111',
                bunnyVideoId: null,
                contentVersion: 1,
                offlineDownloadEnabled: true,
                isFree: false,
                sortOrder: null,
              },
            ],
            files: [],
          },
        ]),
      },
    } as any;
    const bunny = { extractBunnyVideoId: jest.fn().mockReturnValue('11111111-1111-4111-8111-111111111111') };
    const service = new LecturesService(prisma, bunny as any);
    jest.spyOn(service as any, 'getCourseAccess').mockResolvedValue({
      hasAccess: true,
      isOwnerOrAdmin: false,
      isStudent: true,
    });

    const result = await service.listLectures('course-1', { userId: 'student-user-1', type: 'STUDENT' });

    expect(result[0].videos[0].videoUrl).toBeUndefined();
    expect(result[0].videos[0].bunnyVideoId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result[0].videos[0].contentVersion).toBe(1);
    expect(result[0].videos[0].offlineDownloadEnabled).toBe(true);
    expect(result[0].videos[0].locked).toBe(false);
    expect(bunny.extractBunnyVideoId).toHaveBeenCalledWith(
      'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111',
    );
  });

  it('does not expose locked video URLs when listing lectures without access', async () => {
    const prisma = {
      lecture: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'lecture-1',
            videos: [
              {
                id: 'video-1',
                videoUrl: 'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111',
                isFree: false,
                sortOrder: null,
              },
            ],
            files: [],
          },
        ]),
      },
    } as any;
    const bunny = { extractBunnyVideoId: jest.fn().mockReturnValue('11111111-1111-4111-8111-111111111111') };
    const service = new LecturesService(prisma, bunny as any);
    jest.spyOn(service as any, 'getCourseAccess').mockResolvedValue({
      hasAccess: false,
      isOwnerOrAdmin: false,
      isStudent: true,
    });

    const result = await service.listLectures('course-1', { userId: 'student-user-1', type: 'STUDENT' });

    expect(result[0].videos[0].videoUrl).toBeUndefined();
    expect(result[0].videos[0].locked).toBe(true);
  });

  it('updates a video URL without changing other video fields', async () => {
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          videoUrl: 'https://old.example/video.m3u8',
          duration: 60,
          lecture: { courseId: 'course-1' },
        }),
        update: jest.fn().mockResolvedValue({ id: 'video-1' }),
      },
    } as any;
    const bunny = { extractBunnyVideoId: jest.fn().mockReturnValue(null) };
    const service = new LecturesService(prisma, bunny as any);

    await service.updateVideo('video-1', { videoUrl: 'https://new.example/video.m3u8' });

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: {
        videoUrl: 'https://new.example/video.m3u8',
        bunnyVideoId: null,
        contentVersion: { increment: 1 },
      },
    });
  });

  it('does not bump contentVersion when a metadata edit re-sends the same URL', async () => {
    const currentUrl =
      'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111';
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          videoUrl: currentUrl,
          bunnyVideoId: '11111111-1111-4111-8111-111111111111',
          duration: 60,
          lecture: { courseId: 'course-1' },
        }),
        update: jest.fn().mockResolvedValue({ id: 'video-1' }),
      },
    } as any;
    const bunny = { extractBunnyVideoId: jest.fn() };
    const service = new LecturesService(prisma, bunny as any);

    await service.updateVideo('video-1', {
      videoUrl: currentUrl,
      videoName: 'Renamed',
    });

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: { videoName: 'Renamed' },
    });
  });

  it('updates a file URL without changing other file fields', async () => {
    const prisma = {
      lectureFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          lectureId: 'lecture-1',
          fileUrl: 'https://old.example/file.pdf',
        }),
        update: jest.fn().mockResolvedValue({ id: 'file-1' }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);

    await service.updateLectureFile('file-1', { fileUrl: 'https://new.example/file.pdf' });

    expect(prisma.lectureFile.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: { fileUrl: 'https://new.example/file.pdf' },
    });
  });

  it('deletes a lecture after verifying ownership and related records', async () => {
    const tx = {
      video: {
        findMany: jest.fn().mockResolvedValue([{ id: 'video-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { duration: 0 } }),
      },
      videoInteraction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      videoSegment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      question: {
        findMany: jest.fn().mockResolvedValue([{ id: 'question-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionOption: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      lectureFile: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lecture: {
        delete: jest.fn().mockResolvedValue({ id: 'lecture-1' }),
      },
      course: {
        update: jest.fn().mockResolvedValue({ id: 'course-1', duration: 0 }),
      },
    };
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lecture-1', courseId: 'course-1' }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new LecturesService(prisma, {} as any);
    const ownership = jest.spyOn(service as any, 'assertLectureOwnership').mockResolvedValue(undefined);

    await expect(
      service.deleteLecture('lecture-1', { userId: 'teacher-user-1', type: 'TEACHER' }),
    ).resolves.toEqual({ id: 'lecture-1' });

    expect(ownership).toHaveBeenCalledWith(
      { userId: 'teacher-user-1', type: 'TEACHER' },
      'lecture-1',
    );
    expect(tx.videoInteraction.deleteMany).toHaveBeenCalledWith({ where: { videoId: { in: ['video-1'] } } });
    expect(tx.videoSegment.deleteMany).toHaveBeenCalledWith({ where: { videoId: { in: ['video-1'] } } });
    expect(tx.questionOption.deleteMany).toHaveBeenCalledWith({ where: { questionId: { in: ['question-1'] } } });
    expect(tx.lectureFile.deleteMany).toHaveBeenCalledWith({ where: { lectureId: 'lecture-1' } });
    expect(tx.lecture.delete).toHaveBeenCalledWith({ where: { id: 'lecture-1' } });
    expect(tx.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { duration: 0 },
    });
  });

  it('deletes a lecture file after verifying lecture ownership', async () => {
    const prisma = {
      lectureFile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'file-1',
          lectureId: 'lecture-1',
        }),
        delete: jest.fn().mockResolvedValue({ id: 'file-1' }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    const ownership = jest.spyOn(service as any, 'assertLectureOwnership').mockResolvedValue(undefined);

    await expect(
      service.deleteLectureFile('file-1', { userId: 'teacher-user-1', type: 'TEACHER' }),
    ).resolves.toEqual({ id: 'file-1' });

    expect(ownership).toHaveBeenCalledWith(
      { userId: 'teacher-user-1', type: 'TEACHER' },
      'lecture-1',
    );
    expect(prisma.lectureFile.delete).toHaveBeenCalledWith({ where: { id: 'file-1' } });
  });

  it('deletes a video after verifying course ownership and recalculates course duration', async () => {
    const tx = {
      videoInteraction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      video: {
        delete: jest.fn().mockResolvedValue({ id: 'video-1' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { duration: 125 } }),
      },
      course: {
        update: jest.fn().mockResolvedValue({ id: 'course-1', duration: 125 }),
      },
    };
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          lecture: { courseId: 'course-1' },
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new LecturesService(prisma, {} as any);
    const ownership = jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);

    await expect(
      service.deleteVideo('video-1', { userId: 'teacher-user-1', type: 'TEACHER' }),
    ).resolves.toEqual({ success: true });

    expect(ownership).toHaveBeenCalledWith(
      { userId: 'teacher-user-1', type: 'TEACHER' },
      'course-1',
    );
    expect(tx.videoInteraction.deleteMany).toHaveBeenCalledWith({ where: { videoId: 'video-1' } });
    expect(tx.video.delete).toHaveBeenCalledWith({ where: { id: 'video-1' } });
    expect(tx.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: { duration: 125 },
    });
  });

  it('preserves a question sort order when it is omitted from an update', async () => {
    const question = {
      id: 'question-1',
      lectureId: 'lecture-1',
      questionText: 'Original question',
      imageUrl: null,
      questionType: 'multiple_choice',
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(question)
          .mockResolvedValueOnce({ id: 'question-1', options: [] }),
        update: jest.fn().mockResolvedValue({ id: 'question-1' }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);

    await service.updateQuestion('question-1', { questionText: 'Updated question' });

    expect(prisma.question.update).toHaveBeenCalledWith({
      where: { id: 'question-1' },
      data: { questionText: 'Updated question' },
    });
  });

  it('changes a question sort order only when a numeric value is sent', async () => {
    const question = {
      id: 'question-1',
      lectureId: 'lecture-1',
      questionText: 'Original question',
      imageUrl: null,
      questionType: 'multiple_choice',
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(question)
          .mockResolvedValueOnce({ id: 'question-1', options: [] }),
        update: jest.fn().mockResolvedValue({ id: 'question-1' }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);

    await service.updateQuestion('question-1', { sortOrder: 7 });

    expect(prisma.question.update).toHaveBeenCalledWith({
      where: { id: 'question-1' },
      data: { sortOrder: 7 },
    });
  });

  it('ignores a null question sort order', async () => {
    const question = {
      id: 'question-1',
      lectureId: 'lecture-1',
      questionText: 'Original question',
      imageUrl: null,
      questionType: 'multiple_choice',
    };
    const prisma = {
      question: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(question)
          .mockResolvedValueOnce({ id: 'question-1', options: [] }),
        update: jest.fn().mockResolvedValue({ id: 'question-1' }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);

    await service.updateQuestion('question-1', { sortOrder: null } as any);

    expect(prisma.question.update).not.toHaveBeenCalled();
  });

  it('assigns the current questions count plus one when creating without a sort order', async () => {
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lecture-1', courseId: 'course-1' }),
      },
      question: {
        count: jest.fn().mockResolvedValue(4),
        create: jest.fn().mockResolvedValue({ id: 'question-5', sortOrder: 5 }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'assertLectureOwnership').mockResolvedValue(undefined);

    await service.createQuestion(
      {
        lectureId: 'lecture-1',
        questionText: 'New question',
        questionType: 'short_answer',
        points: 1,
      },
      { userId: 'teacher-user-1', type: 'TEACHER' },
    );

    expect(prisma.question.count).toHaveBeenCalledWith({
      where: { lectureId: 'lecture-1' },
    });
    expect(prisma.question.create).toHaveBeenCalledWith({
      data: {
        lectureId: 'lecture-1',
        questionText: 'New question',
        imageUrl: null,
        explanation: null,
        questionType: 'short_answer',
        points: 1,
        sortOrder: 5,
        options: undefined,
      },
      include: {
        options: {
          orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        },
      },
    });
  });

  it('keeps an explicitly supplied question sort order without counting questions', async () => {
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lecture-1', courseId: 'course-1' }),
      },
      question: {
        count: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'question-1', sortOrder: 9 }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'assertLectureOwnership').mockResolvedValue(undefined);

    await service.createQuestion(
      {
        lectureId: 'lecture-1',
        questionText: 'Ordered question',
        questionType: 'short_answer',
        points: 1,
        sortOrder: 9,
      },
      { userId: 'teacher-user-1', type: 'TEACHER' },
    );

    expect(prisma.question.count).not.toHaveBeenCalled();
    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 9 }),
      }),
    );
  });

  it('creates a video segment with a null end time', async () => {
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          lecture: { courseId: 'course-1' },
        }),
      },
      videoSegment: {
        create: jest.fn().mockResolvedValue({ id: 'segment-1', endSeconds: null }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);

    await service.createVideoSegment(
      'video-1',
      { segmentName: 'Intro', startSeconds: 10, endSeconds: null },
      { userId: 'teacher-user-1', type: 'TEACHER' },
    );

    expect(prisma.videoSegment.create).toHaveBeenCalledWith({
      data: {
        videoId: 'video-1',
        segmentName: 'Intro',
        startSeconds: 10,
        endSeconds: null,
        sortOrder: null,
      },
    });
  });

  it('updates a video segment end time to null', async () => {
    const prisma = {
      videoSegment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'segment-1',
          videoId: 'video-1',
          startSeconds: 10,
          endSeconds: 30,
          video: { lecture: { courseId: 'course-1' } },
        }),
        update: jest.fn().mockResolvedValue({ id: 'segment-1', endSeconds: null }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);

    await service.updateVideoSegment(
      'video-1',
      'segment-1',
      { endSeconds: null },
      { userId: 'teacher-user-1', type: 'TEACHER' },
    );

    expect(prisma.videoSegment.update).toHaveBeenCalledWith({
      where: { id: 'segment-1' },
      data: { endSeconds: null },
    });
  });

  it('requests deterministic ordering for questions and their options in lecture details', async () => {
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'lecture-1',
          course: {
            id: 'course-1',
            imageUrl: null,
            teacher: {
              id: 'teacher-1',
              name: 'Teacher',
              description: null,
              image: null,
              instagramUrl: null,
              _count: { teacherLikes: 0 },
            },
          },
          files: [],
          videos: [],
          questions: [],
        }),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'getCourseAccess').mockResolvedValue({
      hasAccess: true,
      isOwnerOrAdmin: true,
      isStudent: false,
    });

    await service.getLectureDetails('lecture-1');

    expect(prisma.lecture.findUnique.mock.calls[0][0].include.questions).toEqual({
      orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      include: {
        options: {
          orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        },
      },
    });
  });
});

describe('LecturesService TUS video completion safeguards', () => {
  const bunnyVideoId = '11111111-1111-4111-8111-111111111111';
  const streamPlayUrl = `https://video.bunnycdn.com/play/123/${bunnyVideoId}`;

  function createTusService(existingVideo: any = null) {
    const tx = {
      video: {
        create: jest.fn((args: any) => Promise.resolve({ id: 'created-video', ...args.data })),
        update: jest.fn((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
        aggregate: jest.fn().mockResolvedValue({ _sum: { duration: 12 } }),
      },
      course: {
        update: jest.fn().mockResolvedValue({ id: 'course-1', duration: 12 }),
      },
    };
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lecture-1', courseId: 'course-1' }),
      },
      video: {
        findFirst: jest.fn().mockResolvedValue(existingVideo),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any;
    const bunny = {
      getStreamPlayUrl: jest.fn().mockReturnValue(streamPlayUrl),
      getStreamPlaybackPayload: jest.fn().mockResolvedValue({
        streamVideoId: bunnyVideoId,
        streamPlayUrl,
        streamEmbedUrl: `https://player.mediadelivery.net/embed/123/${bunnyVideoId}`,
        streamFallbackUrl: null,
      }),
    };
    const service = new LecturesService(prisma, bunny as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);

    return { service, prisma, bunny, tx };
  }

  it('saves the Bunny Stream GUID and stable play URL when completing a TUS upload', async () => {
    const { service, tx } = createTusService();

    await service.completeTusVideoUpload('lecture-1', {
      videoId: bunnyVideoId,
      videoName: 'New video',
      duration: 12,
      size: '3456',
      offlineDownloadEnabled: false,
      isFree: true,
      sortOrder: 3,
    });

    expect(tx.video.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        videoName: 'New video',
        videoUrl: streamPlayUrl,
        bunnyVideoId,
        duration: 12,
        size: '3456',
        offlineDownloadEnabled: false,
        isFree: true,
        sortOrder: 3,
      }),
    });
  });

  it('does not create a null-derived placeholder when Bunny fallback URL is null', async () => {
    const { service, tx } = createTusService();

    await service.completeTusVideoUpload('lecture-1', {
      videoId: bunnyVideoId,
      sortOrder: 1,
    });

    const data = tx.video.create.mock.calls[0][0].data;
    expect(data.videoUrl).toBe(streamPlayUrl);
    expect(data.videoUrl).not.toContain('null');
    expect(data.videoUrl).not.toContain('undefined');
    expect(data.videoUrl).not.toBe('nullplay_');
  });

  it('does not clear an existing Bunny GUID or replace a valid URL when completion finds the video', async () => {
    const existing = {
      id: 'video-1',
      bunnyVideoId,
      videoUrl: streamPlayUrl,
      sortOrder: 4,
      offlineDownloadEnabled: true,
      size: '1000',
      duration: 20,
    };
    const { service, tx } = createTusService(existing);

    const result = await service.completeTusVideoUpload('lecture-1', {
      videoId: bunnyVideoId,
    });

    expect(tx.video.update).not.toHaveBeenCalled();
    expect(tx.video.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'video-1',
      bunnyVideoId,
      videoUrl: streamPlayUrl,
    });
  });

  it('backfills bunnyVideoId on an existing legacy record without touching its videoUrl when no new URL is needed', async () => {
    const existing = {
      id: 'video-1',
      bunnyVideoId: null,
      videoUrl: streamPlayUrl,
      sortOrder: 4,
      offlineDownloadEnabled: true,
      size: '1000',
      duration: 20,
    };
    const { service, tx } = createTusService(existing);

    await service.completeTusVideoUpload('lecture-1', {
      videoId: bunnyVideoId,
    });

    expect(tx.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: { bunnyVideoId },
    });
    expect(tx.video.create).not.toHaveBeenCalled();
  });

  it('fails clearly for an invalid or missing Bunny GUID before saving anything', async () => {
    const { service, tx, prisma, bunny } = createTusService();

    await expect(
      service.completeTusVideoUpload('lecture-1', { videoId: 'not-a-guid' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.lecture.findUnique).not.toHaveBeenCalled();
    expect(bunny.getStreamPlayUrl).not.toHaveBeenCalled();
    expect(tx.video.create).not.toHaveBeenCalled();
    expect(tx.video.update).not.toHaveBeenCalled();
  });

  it('preserves an existing Bunny GUID when a manual URL update has no new Bunny ID', async () => {
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          videoUrl: streamPlayUrl,
          bunnyVideoId,
          duration: 60,
          lecture: { courseId: 'course-1' },
        }),
        update: jest.fn().mockResolvedValue({ id: 'video-1' }),
      },
    } as any;
    const bunny = { extractBunnyVideoId: jest.fn().mockReturnValue(null) };
    const service = new LecturesService(prisma, bunny as any);

    await service.updateVideo('video-1', { videoUrl: 'https://cdn.example.com/manual.mp4' });

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: {
        videoUrl: 'https://cdn.example.com/manual.mp4',
        contentVersion: { increment: 1 },
      },
    });
  });

  it('rejects manual video creation with a null-derived placeholder URL', async () => {
    const prisma = {
      lecture: {
        findUnique: jest.fn().mockResolvedValue({ id: 'lecture-1', courseId: 'course-1' }),
      },
      $transaction: jest.fn(),
    } as any;
    const service = new LecturesService(prisma, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);

    await expect(
      service.createVideo({
        lectureId: 'lecture-1',
        videoName: 'Bad video',
        videoUrl: 'nullplay_',
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects manual video URL updates with undefined-derived placeholder URLs', async () => {
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'video-1',
          videoUrl: streamPlayUrl,
          bunnyVideoId,
          duration: 60,
          lecture: { courseId: 'course-1' },
        }),
        update: jest.fn(),
      },
    } as any;
    const service = new LecturesService(prisma, {} as any);

    await expect(
      service.updateVideo('video-1', { videoUrl: 'undefinedplay_' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.video.update).not.toHaveBeenCalled();
  });
});
