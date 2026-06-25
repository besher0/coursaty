import { LecturesService } from './lectures.service';

describe('LecturesService media links and question ordering', () => {
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
    const service = new LecturesService(prisma, {} as any);

    await service.updateVideo('video-1', { videoUrl: 'https://new.example/video.m3u8' });

    expect(prisma.video.update).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      data: { videoUrl: 'https://new.example/video.m3u8' },
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
              telegramUrl: null,
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
