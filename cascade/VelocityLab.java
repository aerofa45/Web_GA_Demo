import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.net.*;
import java.util.*;
import javax.xml.parsers.*;
import javax.xml.xpath.*;
import org.w3c.dom.*;
import org.apache.velocity.*;
import org.apache.velocity.app.*;
import com.sun.net.httpserver.*;

/** Local educational adapters, NOT Cascade's proprietary tools or CMS. */
public class VelocityLab {
  public static class XmlNode {
    final Node node;
    XmlNode(Node node) { this.node=node; }
    public XmlNode getChild(String name) { for(Node n=node.getFirstChild();n!=null;n=n.getNextSibling()) if(n.getNodeType()==Node.ELEMENT_NODE&&n.getNodeName().equals(name)) return new XmlNode(n); return null; }
    public String getChildText(String name) { XmlNode child=getChild(name); return child==null?"":child.node.getTextContent(); }
    public List<XmlNode> getChildren(String name) { List<XmlNode> result=new ArrayList<>(); for(Node n=node.getFirstChild();n!=null;n=n.getNextSibling()) if(n.getNodeType()==Node.ELEMENT_NODE&&n.getNodeName().equals(name)) result.add(new XmlNode(n)); return result; }
  }
  public static class XPathTool {
    public XmlNode selectSingleNode(XmlNode root,String expression) throws Exception { Node node=(Node)XPathFactory.newInstance().newXPath().evaluate(expression,root.node,XPathConstants.NODE); return node==null?null:new XmlNode(node); }
  }
  public static class EscapeTool {
    public String xml(String value) { return value==null?"":value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;"); }
  }
  static final EscapeTool escape=new EscapeTool();
  static String render(String xml) throws Exception {
    DocumentBuilderFactory factory=DocumentBuilderFactory.newInstance();
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities",false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
    factory.setXIncludeAware(false); factory.setExpandEntityReferences(false);
    Document doc=factory.newDocumentBuilder().parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
    VelocityEngine engine=new VelocityEngine();engine.init();VelocityContext context=new VelocityContext();
    context.put("contentRoot",new XmlNode(doc)); context.put("_XPathTool",new XPathTool());context.put("_EscapeTool",escape);
    StringWriter writer=new StringWriter();
    engine.evaluate(context,writer,"program",Files.readString(Path.of("cascade/program.vm")));return writer.toString();
  }
  static String xml(String title,String intro,String features) { StringBuilder out=new StringBuilder("<system-index-block><system-page><system-data-structure><title>"+escape.xml(title)+"</title><intro>"+escape.xml(intro)+"</intro>"); for(String feature:features.split("\\R")) if(!feature.isBlank()) out.append("<feature><title>").append(escape.xml(feature)).append("</title></feature>");return out+"</system-data-structure></system-page></system-index-block>"; }
  static String shell(String body) { return "<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Velocity Content Lab | Local Cascade-style Sandbox</title><style>body{font:18px/1.6 Arial;max-width:900px;margin:40px auto;padding:20px;color:#252923;background:#faf8f3}label{display:block;margin-top:18px}input,textarea{display:block;width:95%;padding:12px;font:inherit;border:1px solid #666}button{padding:14px;background:#821d32;color:white;font:inherit;margin:20px 0;border:0}a{color:#821d32}:focus-visible{outline:3px solid #176cbd;outline-offset:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:20px}</style></head><body><main>"+body+"</main></body></html>"; }
  public static void main(String[] args) throws Exception {
    String sample=Files.readString(Path.of("cascade/example-index-block.xml"));
    if(args.length==0||args[0].equals("test")) {
      String result=render(sample);if(!result.contains("<h1>Digital Media</h1>")||!result.contains("Design with purpose")) throw new AssertionError("Sample failed");
      String escaped=render(xml("<script>alert(1)</script>","Research & design","One\nTwo"));
      if(escaped.contains("<script>")||!escaped.contains("&lt;script&gt;")||!escaped.contains("Research &amp; design")) throw new AssertionError("Escaping failed");
      if(!render("<system-index-block/>").isBlank()) throw new AssertionError("Missing page failed");
      Files.createDirectories(Path.of("evidence"));Files.writeString(Path.of("evidence/velocity-render.html"),shell(result));
      Files.writeString(Path.of("evidence/velocity-tests.json"),"{\"runtime\":\"Apache Velocity 2.4.1\",\"tests\":[\"XML selection and repeated fields\",\"HTML escaping\",\"missing page\"],\"passed\":3,\"cascadeIntegration\":false}");
      System.out.println("3 real Apache Velocity tests passed. Cascade tool adapters are local implementations.");return;
    }
    Path saved=Path.of("work/sandbox.xml");Files.createDirectories(saved.getParent());
    HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",4192),0);
    server.createContext("/",exchange->{try {
      String body;
      if(exchange.getRequestMethod().equals("POST")) {
        String origin=exchange.getRequestHeaders().getFirst("Origin");
        if(origin!=null&&!origin.equals("http://127.0.0.1:4192")) {exchange.sendResponseHeaders(403,-1);return;}
        if(!exchange.getRequestURI().getPath().equals("/preview")) { exchange.sendResponseHeaders(404,-1);return; }
        byte[] raw=exchange.getRequestBody().readNBytes(12001);if(raw.length>12000) { exchange.sendResponseHeaders(413,-1);return; }
        Map<String,String> fields=new HashMap<>();for(String pair:new String(raw,StandardCharsets.UTF_8).split("&")){String[] parts=pair.split("=",2);if(parts.length==2)fields.put(URLDecoder.decode(parts[0],StandardCharsets.UTF_8),URLDecoder.decode(parts[1],StandardCharsets.UTF_8));}
        String title=fields.getOrDefault("title","").trim(),intro=fields.getOrDefault("intro","").trim(),features=fields.getOrDefault("features","").trim();
        if(title.isEmpty()||title.length()>150||intro.isEmpty()||intro.length()>2000||features.length()>2000) {exchange.sendResponseHeaders(400,-1);return;}
        String edited=xml(title,intro,features);Files.writeString(saved,edited);
        body=shell("<p>LOCAL PREVIEW · NOT PUBLISHED TO CASCADE</p>"+render(edited)+"<h2>XML supplied to the Format</h2><pre>"+escape.xml(edited)+"</pre><a href='/'>Return to editor</a>");
      } else if(exchange.getRequestURI().getPath().equals("/preview") && Files.exists(saved)) {
        body=shell("<p>SAVED LOCAL VELOCITY PREVIEW</p>"+render(Files.readString(saved))+"<a href='/'>Return to editor</a>");
      } else {
        body=shell("<p>LOCAL CASCADE-STYLE LEARNING SANDBOX</p><h1>Velocity Content Lab</h1><p>This is an independent Java lab using the real Apache Velocity engine and local XML/tool adapters. It is not Hannon Hill Cascade CMS. No accounts, roles, vendor services or external publication.</p><form method='post' action='/preview'><label>Program title<input name='title' required maxlength='150' value='Digital Media'></label><label>Introduction<textarea name='intro' required maxlength='2000'>Build thoughtful digital experiences.</textarea></label><label>Features (one per line)<textarea name='features' maxlength='2000'>Design with purpose\nBuild for everyone</textarea></label><button>Save XML and render Velocity preview</button></form><p>Preview XML is saved in work/sandbox.xml. Templates are edited in cascade/program.vm, not accepted as untrusted HTTP input.</p>");
      }
      byte[] bytes=body.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","text/html; charset=utf-8");exchange.getResponseHeaders().set("X-Content-Type-Options","nosniff");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
    }catch(Exception err){exchange.sendResponseHeaders(500,-1);}finally{exchange.close();}});
    server.start();System.out.println("Local Cascade-style Velocity lab: http://127.0.0.1:4192 (Ctrl+C to stop)");
  }
}
