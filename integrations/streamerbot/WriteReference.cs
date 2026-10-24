using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Globalization;
using System.Text.RegularExpressions;

// Inline C# action. Custom argument names are explicit; no provider field is guessed.
public class CPHInline {
 public bool Execute() {
  bool enabled; if (!CPH.TryGetArg<bool>("bescF5Enabled", out enabled) || !enabled) return false;
  string folder,kind,id,channel,occurred;
  if (!CPH.TryGetArg<string>("bescQueueDir",out folder) || !CPH.TryGetArg<string>("bescReferenceKind",out kind)
   || !CPH.TryGetArg<string>("bescReferenceId",out id) || !CPH.TryGetArg<string>("bescOccurredAt",out occurred)) return false;
  CPH.TryGetArg<string>("bescChannel",out channel);
  try {
   if (!Path.IsPathRooted(folder) || folder.StartsWith("\\\\")) return false;
   DateTimeOffset when; if (!Regex.IsMatch(occurred,"T.*(Z|[+-][0-9]{2}:[0-9]{2})$") || !DateTimeOffset.TryParse(occurred,CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal,out when)) return false;
   string url;
   if (kind=="clip" && Regex.IsMatch(id,@"\A[A-Za-z0-9_-]{1,100}\z")) url="https://clips.twitch.tv/"+id;
   else if (kind=="video" && Regex.IsMatch(id,@"\A[0-9]{1,30}\z")) url="https://www.twitch.tv/videos/"+id;
   else if (kind=="stream" && Regex.IsMatch(id,@"\A[0-9]{1,30}\z") && channel!=null && Regex.IsMatch(channel,@"\A[a-z0-9_]{1,25}\z")) url="https://www.twitch.tv/"+channel;
   else return false;
   string reference=kind+":"+id,key;
   using (SHA256 sha=SHA256.Create()) key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(kind+"|"+reference))).Replace("-","").ToLowerInvariant();
   folder=Path.GetFullPath(folder);string inbox=Path.Combine(folder,"inbox"),sent=Path.Combine(folder,"sent");Directory.CreateDirectory(inbox);
   if (File.Exists(Path.Combine(sent,key+".json")) || File.Exists(Path.Combine(inbox,key+".json"))) return true;
   if (Directory.GetFiles(inbox,"*.json").Length>=2000) {CPH.LogWarn("BESC F5-wachtrij is vol; verwerk eerst de bestaande referenties.");return false;}
   // Every value below is fixed enum/strict ASCII ID/constructed URL/formatted time.
   // No general serializer or runtime-specific assembly is needed.
   string payload="{\"schemaVersion\":1,\"kind\":\""+kind+"\",\"reference_id\":\""+reference+"\",\"canonical_url\":\""+url+"\",\"occurred_at\":\""+when.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture)+"\"}";
   string temp=Path.Combine(inbox,key+"."+Guid.NewGuid().ToString("N")+".tmp");
   File.WriteAllText(temp,payload,new UTF8Encoding(false));
   try {File.Move(temp,Path.Combine(inbox,key+".json"));}catch(IOException){if(File.Exists(temp))File.Delete(temp);if(!File.Exists(Path.Combine(inbox,key+".json")))throw;}
   return true;
  } catch {CPH.LogWarn("BESC F5-bronreferentie kon niet lokaal worden klaargezet; controleer de afgeschermde wachtrij.");return false;}
 }
}
