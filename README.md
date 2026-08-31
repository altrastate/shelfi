# Shelfi Core

SHELFI V1 — PHASE ZERO FOUNDATION BUILD

Build Shelfi, a modern online multi-tenant school library platform.

This is the foundation phase.

Do not rush into feature development.

The priority is creating a clean, scalable architecture.

PRODUCT PURPOSE

Shelfi is:

A modern school library platform combining:

Physical Library Management

Digital Library Access

Shelfi is NOT:

School management software

LMS

Homework system

Social network

General AI tutor

Remain focused on the library.

TECHNICAL REQUIREMENTS

Use Lovable Cloud backend.

Use Supabase database architecture.

The system must be:

Fully online

Multi-tenant

Secure

Mobile responsive

Production-ready foundation

Do not implement offline functionality.

MULTI-TENANT FOUNDATION

A school is a tenant.

Create architecture where all school data is isolated.

Every school-owned entity must have:

school_id

Examples:

schools

profiles

students

staff

books

physical copies

digital resources

borrowing records

reading records

USER ROLES

Create role architecture for:

System Administrator

Manages the entire Shelfi platform.

Responsibilities:

Manage schools

Manage global catalogue

Manage publisher relationships

Manage platform settings

School Administrator/Librarian

Manages one school.

Responsibilities:

Physical library

School digital resources

Students

Borrowing

Student

Uses the library.

Responsibilities:

Browse books

Read digital resources

Manage My Shelf

Track reading

AUTHENTICATION

Implement secure authentication.

Users should belong to:

A school

A role

Students should join through a school-controlled process.

Do not create open public student accounts.

DATABASE FOUNDATION

Create clean database structure.

Avoid duplicate concepts.

Prepare architecture for:

Physical Library

Books

Physical copies

Categories

Authors

Borrowing

Returns

Overdue tracking

Digital Library

Digital resources

Book metadata

Reading progress

Bookmarks

My Shelf

Shelfi Catalogue

Global digital resources

Publishers

Licences

School access permissions

Purchases

DIGITAL RESOURCE ARCHITECTURE

Support two sources:

School-provided resources

Shelfi licensed catalogue resources

Add a source distinction.

Example:

source_type:

school

or

shelfi_catalogue

DESIGN FOUNDATION

Before creating many screens, establish:

Typography

Colors

Spacing

Components

Navigation patterns

Cards

Buttons

Forms

Empty states

Loading states

The design standard:

DIGITAL EXCELLENCE

The product should feel:

Modern
Professional
Warm
Reliable

MOBILE FIRST

The majority of users may use Android phones.

Prioritize:

Fast loading

Simple navigation

Touch-friendly controls

Low complexity

DO NOT BUILD YET

Do not build:

Payments

AI assistant

Publisher marketplace UI

Physical borrowing workflows

Digital reader

Reports

Analytics

Only create the foundation.

COMPLETION REQUIREMENT

At the end of Phase Zero, Shelfi should have:

✓ Multi-tenant architecture

✓ Authentication

✓ Roles

✓ Secure database foundation

✓ Clean navigation structure

✓ Design system foundation

✓ Ready architecture for future features

Do not create fake functionality.

Do not use placeholder data as a substitute for real architecture.

Build the foundation correctly.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/20b24f34-d7d0-4fd4-9481-b46d11720f90).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
