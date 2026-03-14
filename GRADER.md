# Team Ate Homework 5
Login credentials:
| Role       | Username | Password    |
| ----       | -------- | --------    |
| Superadmin | dictator | dictator135 |
| Analyst    | analyst  | analyst135  |
| Viewer     | viewer   | viewer135   |

## Scenarios
Please do these in **order**.

### Superadmin
Login with credentials:
- Username: dictator
- Password: dictator135

Step-by-step:
1. You have access to every page. The power this role has over others is to manage the roles of others.
2. Go to "Manage Users"
3. Change the role of "viewer" role to "analyst" and click "Save Changes." You can keep this change or revert it back. It's up to you.

(See limitations at the end of the doc)

### Analyst
Login with credentials:
- Username: analyst
- Password: analyst135

Step-by-step:
1. You have access to the Dashboard, User Engagement, Performance, Errors, and Reports pages.
2. Go to the Errors page and look around.
3. Scroll to the bottom and find the "Analyst Notes" text box. 
4. Add/edit the message to your liking. It'll persist after a page refresh (go ahead and try it).
5. Go to the "Analyst Comments" section and feel free to add a comment. Click "Add Comment" once you're happy with it.
6. Once done, you can also edit and delete any comments you wish.
7. Scroll back up to the top, and click "Save PDF report." **Save the PDF to your machine locally**.
8. Click "Upload Saved PDF" and find the PDF on your local machine and click it.

(See limitations at the end of the doc)

### Viewer
Login with credentials:
- Username: dictator
- Password: dictator135

Step-by-step:
1. You have access to the Dashboard, Reports, and Raw Data.
2. Try clicking on "Manage Users". This will lead to a 403 error.
3. Now, try editing the URL of the website to something nonsensical like "reporting.teamate.site/funky". This leads to a 404 error.
4. Go to the "Reports" page.
5. Click "Open PDF" on any report you want.

(See limitations at the end of the doc)

## Limitations, Acknowledgements, Concerns
On architecture and bugs,
- We heavily relied on vibecoding, so there are likely many concerns with the actual security of this analytics application. Due to the sheer amount of code quickly generated, it became easy for us to just accept it if it looks good on the surface.
- For users of different roles, we should have limited the navigation bar to only pages that the user should only be able to see (e.g. viewer should only see Dashboard, Reports, and Raw Data). However, we do have 403 pages in place.

On analyst notes/comments:
- We did not account for race conditions. If people are editing the analyst notes box at the same time, the result is undeterministic, and we do not have measures to prevent that situation.
- We do not limit comment CRUD operations to be done by the respective comment author. Therefore, they can be edited, deleted, and written by anyone.

On saving reports:
- PDFs must be saved locally then uploaded while on the page in order to be saved on the server. This is an inconvienence to the analyst and we acknowledge that. 

On role management:
- We did not account for possible race conditions if two people are trying to edit roles at the same time. We do not know what happens if this happens.
- People with the superadmin role cannot modify their own role or others' roles if they also have the superadmin role. This is an intentional design choice.
  - Additionally, a superadmin cannot grant the role to another user i.e. the only roles that can be changed are between viewer and analyst.