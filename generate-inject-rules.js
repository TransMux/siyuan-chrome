#!/usr/bin/env node

/**
 * 生成注入规则脚本
 * 扫描 inject 目录并生成注入脚本配置文件
 */

const fs = require('fs');
const path = require('path');

class InjectRulesGenerator {
    constructor() {
        this.injectDir = path.join(__dirname, 'inject');
        this.outputFile = path.join(__dirname, 'inject-scripts.json');
        this.scripts = [];
    }

    /**
     * 主执行函数
     */
    async generate() {
        console.log('🔍 扫描 inject 目录...');
        
        if (!fs.existsSync(this.injectDir)) {
            console.error('❌ inject 目录不存在');
            return;
        }

        await this.scanDirectory(this.injectDir, 'inject');
        
        // 按优先级排序脚本
        this.sortScripts();
        
        // 生成配置文件
        await this.writeScriptsFile();
        
        console.log(`✅ 生成完成! 找到 ${this.scripts.length} 个注入脚本`);
        console.log(`📄 脚本文件: ${this.outputFile}`);
    }

    /**
     * 递归扫描目录
     */
    async scanDirectory(dirPath, relativePath) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const currentPath = path.join(relativePath, entry.name).replace(/\\/g, '/');
            
            if (entry.isDirectory()) {
                // 递归扫描子目录
                await this.scanDirectory(fullPath, currentPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                // 找到JS文件，添加到脚本列表
                this.addScript(currentPath);
            }
        }
    }

    /**
     * 添加脚本到列表
     */
    addScript(scriptPath) {
        this.scripts.push({
            path: scriptPath,
            priority: this.calculatePriority(scriptPath)
        });
        console.log(`📝 脚本: ${scriptPath}`);
    }

    /**
     * 计算脚本优先级
     */
    calculatePriority(scriptPath) {
        const parts = scriptPath.split('/');
        
        // 全局脚本最高优先级
        if (parts.length === 2) return 1000;
        
        // 域名脚本
        if (parts.length === 3) return 500;
        
        // 路径脚本，越具体优先级越高
        return 500 - (parts.length * 10);
    }

    /**
     * 按优先级排序脚本
     */
    sortScripts() {
        this.scripts.sort((a, b) => b.priority - a.priority);
    }

    /**
     * 写入脚本文件
     */
    async writeScriptsFile() {
        const scriptPaths = this.scripts.map(script => script.path);
        
        const config = {
            generated: new Date().toISOString(),
            scripts: scriptPaths
        };
        
        fs.writeFileSync(this.outputFile, JSON.stringify(config, null, 2), 'utf8');
        
        console.log(`📊 统计信息：`);
        console.log(`   总脚本数: ${scriptPaths.length}`);
        
        scriptPaths.forEach(script => {
            console.log(`   - ${script}`);
        });
    }
}

// 执行生成
if (require.main === module) {
    const generator = new InjectRulesGenerator();
    generator.generate().catch(console.error);
}

module.exports = InjectRulesGenerator;