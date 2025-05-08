const generateCustomId = (TNX = "ID") => {
    const timestamp = Date.now().toString().slice(-6); 
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `${TNX}-${timestamp}${random}`
}


module.exports = {
    generateCustomId
}