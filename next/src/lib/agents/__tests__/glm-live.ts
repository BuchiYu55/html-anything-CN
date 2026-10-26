import { invokeAgent } from "../invoke";

async function main() {
  console.log("=== 测试 invokeAgent('glm') 真实端到端输出 ===");
  const stream = invokeAgent({
    agent: "glm",
    model: "glm-5.3-flash",
    prompt: "请写一个简短的小红书评测风 HTML 卡片，包含标题和两点要点，以 <div class=\"card\"> 开始，以 </div> 结束。",
  });

  const reader = stream.getReader();
  let deltaCount = 0;
  let hasThinking = false;
  let finalHtml = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    if (value.type === "start") {
      console.log(`[START] 目标端点: ${value.bin}, 模型: ${value.argv.join(" ")}`);
    } else if (value.type === "meta" && value.key === "thinking") {
      if (!hasThinking) {
        process.stdout.write("[THINKING 思考中] ");
        hasThinking = true;
      }
      process.stdout.write(".");
    } else if (value.type === "delta") {
      deltaCount++;
      finalHtml += value.text;
      if (deltaCount === 1) {
        console.log("\n[DELTA 流式内容开始输出]");
      }
      process.stdout.write(value.text);
    } else if (value.type === "meta" && value.key === "usage") {
      console.log("\n[USAGE Token统计]", JSON.stringify(value.value));
    } else if (value.type === "done") {
      console.log(`\n[DONE 完成事件] 退出码: ${value.code}`);
    } else if (value.type === "error") {
      console.error(`\n[ERROR 错误] ${value.message}`);
    }
  }

  console.log(`\n=== 统计: 成功收到 ${deltaCount} 次流式推送，累计 ${finalHtml.length} 字符 ===`);
}

main().catch(console.error);
