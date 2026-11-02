# Cascade integration boundary

## Executable local lab (edition 3)

This folder now includes a runnable independent content sandbox. Install JDK 17+ and run `npm run test:velocity` for real Apache Velocity 2.4.1 tests, or `npm run sandbox` and open http://127.0.0.1:4192. Enter structured content, save XML, render the Format, and reopen `/preview` to verify persistence. The runtime and three JAR versions are pinned in `scripts/velocity.mjs` and downloaded into ignored `work/velocity/`.

`VelocityLab.java` supplies small **local** implementations of the XML node, XPath and escaping tools expected by `program.vm`. The Format is executed by Apache Velocity; the proprietary Cascade application and its tools are not installed. Tests cover repeated features, escaping and missing page data. Rendered HTML and test results are in `evidence/`. The HTTP form stores XML in ignored `work/sandbox.xml`. Never expose this trusted-template learning server to the internet or use real personal data.

The original notes below describe integration with a genuine licensed Cascade environment. References saying the Format was not executed refer specifically to Cascade, not to the newly executed local Java harness.

These are illustrative files for a developer with a licensed Cascade CMS sandbox. No credentials, REST client, CMS instance, publish destination, or Cascade-provided runtime are included. The independent Apache Velocity runner is described above. They have not been imported or executed in Cascade. The React application uses local JavaScript records, not XML or Velocity.

`data-definition.xml` describes a proposed structured editing form. `example-index-block.xml` is the expected sample XML contract; it is not an exported live CMS block. `program.vm` demonstrates XPath selection, loops, conditional handling, and escaped text output with Cascade-provided tools. Do not paste untrusted rich HTML into these plain-text fields.

## Sandbox verification steps

1. Ask the site administrator to create a development site and grant appropriate author/reviewer permissions.
2. Create a Data Definition based on the proposed fields; validate the syntax against the installed Cascade version.
3. Associate it with a Content Type and Page Configuration; create a test page with all fields populated.
4. Create an XML Index Block including page structured data. Inspect its actual XML and adapt the XPath and node traversal in the Format.
5. Create a Velocity Format from `program.vm`, bind block and format to a named region in a site Template, and preview the test page.
6. Verify escaping using text containing ampersands and angle brackets. Test missing fields, repeated groups, and empty content.
7. Configure real author/reviewer roles and workflow separately. Test return-for-changes, approval, permissions, audit logging, and staging publication. These are enforced by Cascade, not by the browser demo.
8. Publish only to an approved staging destination, verify HTML, links, accessibility, and rollback before requesting production approval.

The sample intentionally has no HTML shell, navigation, CMS asset chooser URLs, or production publishing logic. Those depend on the existing university templates and asset model.

References: [Formats](https://www.hannonhill.com/cascadecms/latest/articles/developing-in-cascade/script-formats/index.html), [Velocity tools](https://www.hannonhill.com/cascadecms/latest/articles/developing-in-cascade/script-formats/velocity-tools.html), [official cookbook](https://github.com/hannonhill/Velocity-Cookbook).
