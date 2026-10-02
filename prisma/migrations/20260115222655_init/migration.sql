-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('PRACTICAL', 'THEORETICAL', 'COMPREHENSIVE', 'WORKSHOP', 'EXAM', 'FREE');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('ACTIVE', 'USED', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" BIGSERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "userableId" BIGINT NOT NULL,
    "userableType" "UserType" NOT NULL,
    "fcmToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" BIGINT NOT NULL,
    "yearId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "teacherPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" BIGSERIAL NOT NULL,
    "universityId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" BIGSERIAL NOT NULL,
    "collegeId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Year" (
    "id" BIGSERIAL NOT NULL,
    "departmentId" BIGINT NOT NULL,
    "yearName" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,

    CONSTRAINT "Year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" BIGSERIAL NOT NULL,
    "seasonName" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" BIGSERIAL NOT NULL,
    "departmentId" BIGINT NOT NULL,
    "subjectName" TEXT NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" BIGSERIAL NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "subjectId" BIGINT NOT NULL,
    "yearId" BIGINT NOT NULL,
    "seasonId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "courseType" "CourseType" NOT NULL DEFAULT 'THEORETICAL',
    "isUpcoming" BOOLEAN NOT NULL DEFAULT false,
    "introVideoUrl" TEXT,
    "discussionGroupUrl" TEXT,
    "prerequisiteCourseId" BIGINT,
    "nextCourseId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lecture" (
    "id" BIGSERIAL NOT NULL,
    "courseId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER,

    CONSTRAINT "Lecture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" BIGSERIAL NOT NULL,
    "lectureId" BIGINT NOT NULL,
    "videoName" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoInteraction" (
    "id" BIGSERIAL NOT NULL,
    "videoId" BIGINT NOT NULL,
    "userId" BIGINT NOT NULL,
    "isLiked" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherLike" (
    "id" BIGSERIAL NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "studentId" BIGINT NOT NULL,

    CONSTRAINT "TeacherLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LectureFile" (
    "id" BIGSERIAL NOT NULL,
    "lectureId" BIGINT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,

    CONSTRAINT "LectureFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Automation" (
    "id" BIGSERIAL NOT NULL,
    "lectureId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "questionsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeGroup" (
    "id" BIGSERIAL NOT NULL,
    "courseId" BIGINT NOT NULL,
    "batchName" TEXT NOT NULL,
    "discountPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Code" (
    "id" BIGSERIAL NOT NULL,
    "codeGroupId" BIGINT NOT NULL,
    "codeValue" TEXT NOT NULL,
    "status" "CodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedByStudentId" BIGINT,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "Code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentSubscription" (
    "id" BIGSERIAL NOT NULL,
    "studentId" BIGINT NOT NULL,
    "courseId" BIGINT NOT NULL,
    "finalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_userableId_userableType_idx" ON "User"("userableId", "userableType");

-- CreateIndex
CREATE INDEX "College_universityId_idx" ON "College"("universityId");

-- CreateIndex
CREATE INDEX "Department_collegeId_idx" ON "Department"("collegeId");

-- CreateIndex
CREATE INDEX "Year_departmentId_idx" ON "Year"("departmentId");

-- CreateIndex
CREATE INDEX "Subject_departmentId_idx" ON "Subject"("departmentId");

-- CreateIndex
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");

-- CreateIndex
CREATE INDEX "Course_subjectId_idx" ON "Course"("subjectId");

-- CreateIndex
CREATE INDEX "Course_yearId_idx" ON "Course"("yearId");

-- CreateIndex
CREATE INDEX "Course_seasonId_idx" ON "Course"("seasonId");

-- CreateIndex
CREATE INDEX "Course_prerequisiteCourseId_idx" ON "Course"("prerequisiteCourseId");

-- CreateIndex
CREATE INDEX "Course_nextCourseId_idx" ON "Course"("nextCourseId");

-- CreateIndex
CREATE INDEX "Lecture_courseId_idx" ON "Lecture"("courseId");

-- CreateIndex
CREATE INDEX "Video_lectureId_idx" ON "Video"("lectureId");

-- CreateIndex
CREATE INDEX "VideoInteraction_videoId_idx" ON "VideoInteraction"("videoId");

-- CreateIndex
CREATE INDEX "VideoInteraction_userId_idx" ON "VideoInteraction"("userId");

-- CreateIndex
CREATE INDEX "TeacherLike_studentId_idx" ON "TeacherLike"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherLike_teacherId_studentId_key" ON "TeacherLike"("teacherId", "studentId");

-- CreateIndex
CREATE INDEX "LectureFile_lectureId_idx" ON "LectureFile"("lectureId");

-- CreateIndex
CREATE INDEX "Automation_lectureId_idx" ON "Automation"("lectureId");

-- CreateIndex
CREATE INDEX "CodeGroup_courseId_idx" ON "CodeGroup"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Code_codeValue_key" ON "Code"("codeValue");

-- CreateIndex
CREATE INDEX "Code_codeGroupId_idx" ON "Code"("codeGroupId");

-- CreateIndex
CREATE INDEX "Code_usedByStudentId_idx" ON "Code"("usedByStudentId");

-- CreateIndex
CREATE INDEX "StudentSubscription_courseId_idx" ON "StudentSubscription"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSubscription_studentId_courseId_key" ON "StudentSubscription"("studentId", "courseId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "College" ADD CONSTRAINT "College_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Year" ADD CONSTRAINT "Year_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_prerequisiteCourseId_fkey" FOREIGN KEY ("prerequisiteCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_nextCourseId_fkey" FOREIGN KEY ("nextCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lecture" ADD CONSTRAINT "Lecture_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoInteraction" ADD CONSTRAINT "VideoInteraction_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoInteraction" ADD CONSTRAINT "VideoInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherLike" ADD CONSTRAINT "TeacherLike_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherLike" ADD CONSTRAINT "TeacherLike_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LectureFile" ADD CONSTRAINT "LectureFile_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "Lecture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeGroup" ADD CONSTRAINT "CodeGroup_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_codeGroupId_fkey" FOREIGN KEY ("codeGroupId") REFERENCES "CodeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_usedByStudentId_fkey" FOREIGN KEY ("usedByStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentSubscription" ADD CONSTRAINT "StudentSubscription_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
