extractJobDetails()
      │
      ▼
callGroq()
      │
      ├── Success → Return result
      │
      └── Error
             │
             ▼
      callOpenRouter()
             │
             ├── Success → Return result
             │
             └── Error
                    │
                    ▼
             callGemini()
                    │
                    ├── Success → Return result
                    │
                    └── Error
                           │
                           ▼
                  Return default object





Design Brief
Project Title

Job Application Tracker

Project Overview

Job Application Tracker is a web-based productivity platform designed to help job seekers organize, monitor, and manage their job applications throughout the hiring process. Instead of relying on spreadsheets, notes, or memory, the platform provides a centralized workspace where users can track applications, monitor interview schedules, receive timely reminders, and gain valuable insights into their job search performance.

The product focuses on helping users stay organized and make informed decisions by combining application management with analytics, timeline tracking, document storage, and intelligent reminders.

Background

Applying for jobs often involves managing dozens of applications across multiple job platforms such as LinkedIn, Indeed, company career pages, referrals, and recruitment portals. As the number of applications grows, keeping track of important details becomes increasingly difficult.

Many job seekers forget where they applied, lose track of interview dates, fail to send follow-up emails, or cannot remember which resume version was submitted to a particular company. Existing methods such as spreadsheets or note-taking applications require constant manual maintenance and provide little visibility into overall job search progress.

Job Application Tracker aims to simplify this experience by creating a centralized platform that supports users throughout their entire job search journey.

Problem Statement

Job seekers lack an efficient system to organize and monitor their job applications across multiple platforms. This often results in missed interviews, forgotten follow-ups, poor document management, and limited understanding of their overall job search performance.

Product Vision

To build a centralized platform that enables job seekers to organize, track, and manage every job application while providing real-time reminders, timeline tracking, and actionable insights that improve the effectiveness of their job search.

Product Goals
Organize and manage every application from one centralized platform.
Provide proactive notifications and smart reminders for important events.
Offer a Kanban-style workflow to visualize application progress.
Present a real-time timeline of each application's journey.
Deliver meaningful analytics and AI-powered insights that help users improve their job search strategy.
Target Audience
Primary Users
College Graduates
Freshers
Secondary Users
Career Switchers
Experienced Professionals
Freelancers
User Pain Points

Users commonly experience the following problems during their job search:

No centralized place to manage applications.
Forgetting interview schedules.
Losing track of where a job was discovered.
Forgetting salary information.
Missing follow-up opportunities.
Forgetting which resume version was submitted.
Forgetting which companies have already received an application.
Design Objectives

The product should help users:

Stay organized throughout the job search.
Quickly understand the current status of every application.
Reduce cognitive load by presenting information clearly.
Never miss important interviews or follow-ups.
Make data-driven decisions using analytics and insights.
Easily access resumes, portfolios, certificates, and cover letters.
Feel motivated through visual progress and achievement tracking.
Core Features
Dashboard

A personalized overview of the user's entire job search.

Includes:

Total Applications
Active Applications
Interviews
Offers
Rejections
Application Trends
Resume Usage
Platform Analytics
Upcoming Events
Calendar
AI Insights
Gmail Sync Status
Achievements & Gamification
Notifications
Applications

Manage every job application from a single workspace.

Features include:

Search
Filter
Sort
Status Management
Kanban Board

Visualize applications across hiring stages.

Stages include:

Wishlist
Applied
Assessment
Interview
Offer
Rejected
Accepted
Timeline

Chronological activity history for every application.

Displays:

Application Submitted
Follow-up Sent
Assessment Completed
Interview Scheduled
Offer Received
Rejection Received
Calendar

Displays important job search events including:

Interviews
Assessment Deadlines
Follow-up Reminders
Important Dates
Documents

Centralized document management.

Includes:

Resume
Resume V1
Resume V2
Portfolio
Portfolio PDF
Portfolio Website
Certificates
Academic Certificates
Internship Certificates
Course Certificates
Cover Letter
General Cover Letter
Custom Cover Letters
Analytics

Measure and evaluate job search performance.

Key Metrics:

Applications This Month
Success Rate
Best Job Platform
Interview Rate
Offer Rate

Additional Insights:

Resume Performance
Platform Performance
Average Response Time
Application Status Distribution
Smart Reminder System

Automatically reminds users about important events.

Examples:

Follow up after 7 days
Interview tomorrow
Resume needs updating
Assessment deadline approaching
Upcoming interview
Gmail detected a new interview or offer email
AI Insights

Provides personalized recommendations based on user activity.

Examples:

More interviews are coming from LinkedIn.
Resume V2 performs better than Resume V1.
Several applications require follow-up.
Most applications are still awaiting responses.
Navigation Structure
Dashboard
Applications
Kanban Board
Timeline
Calendar
Analytics
Documents
Smart Reminders
Notifications
Settings
Success Criteria

The design should enable users to:

Track every application without confusion.
Instantly understand the current status of their job search.
Reduce missed interviews and follow-ups.
Easily locate resumes and supporting documents.
Gain actionable insights from application data.
Maintain motivation throughout the job search process through progress tracking and achievements.
Project Outcome

The final product will be a responsive web application that transforms job application management into a simple, organized, and data-driven experience. By combining tracking, reminders, analytics, timeline visualization, and intelligent insights, the platform aims to help users stay in control of their job search and improve their chances of securing employment.